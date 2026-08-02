# How's u — Production Deployment Runbook

This runbook ships the full stack (backend, frontend, Postgres, Redis, USDC-first
payments) as containers through `docker compose`. It is the last buildable step
before live launch; the only remaining items require your infrastructure and
credentials, not code (see "Launch gate" at the bottom).

---

## 1. Files you just introduced

| Path | Purpose |
|------|---------|
| `backend/Dockerfile` | Multi-stage Medusa image (build → prune dev deps → migrate → start) |
| `frontend/Dockerfile` | Multi-stage Next.js image using `output: "standalone"` |
| `docker-compose.prod.yml` | Full stack, all services wired together on one network |
| `.env.deploy.example` | Committed template with **placeholder** values |
| `.github/workflows/docker-build.yml` | CI that proves both images build on `main` |
| `.gitignore` | Ensures `*/.env*` and `.env.deploy` are never committed |

The root `.gitignore` blocks any `.env` / `.env.deploy` file from ever being
committed, so the Circle / Paystack secrets cannot leak through a `git push`.

---

## 2. Prerequisites on the host

- Docker Engine 24+ with the Compose v2 plugin (`docker compose`, not `docker-compose`)
- A domain + DNS A record (`yourdomain.com` → host IP, and `api.yourdomain.com` if you want to expose the backend)
- (Production) a reverse proxy / TLS terminator in front: Caddy, Traefik, or an LB like Cloudflare. See §5.

---

## 3. Prepare secrets

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# run 4 times → JWT_SECRET, COOKIE_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD
```

Create `.env.deploy` from the template and fill in real values **on the host only**:

```bash
cp .env.deploy.example .env.deploy
# edit JWT_SECRET, COOKIE_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD,
# NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (from Admin > Settings > API Keys), URLs
```

The compose file is strict: required vars (marked `:?`) fail fast at `up` time
instead of silently booting with placeholders. `CIRCLE_API_KEY=mock` and
`PAYSTACK_SECRET_KEY=mock` are the only vars that default — meaning **offline,
deterministic settlement** (no chain, no keys). Flip them to real values to move
real money.

---

## 4. Build & launch

```bash
docker compose --env-file .env.deploy -f docker-compose.prod.yml up -d --build
```

Wait for healthchecks, then:

```bash
docker compose -f docker-compose.prod.yml ps        # all "healthy"/"running"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080   # frontend → 200
```

- Storefront: `http://localhost:8080` (port from `PORT`, default 8080)
- Backend health: `http://xxx` — backend is on the internal network. Check it:

```bash
docker compose -f docker-compose.prod.yml exec backend sh -c \
  "curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9000/store/regions"
```

First boot runs `medusa migrations run` automatically (entrypoint in
`backend/Dockerfile`) before `medusa start`. The DB is seeded by the `seed`
script you run separately (see §7).

### Fresh-build vs. cached

- First build pulls base images and compiles; allow 5–10 min.
- Later builds are cached via BuildKit layer caching on the host. CI also uses
  GitHub's `gha` cache so `main` images are warm.

---

## 5. TLS & domain exposure (production)

Use Caddy for automatic HTTPS. Example `Caddyfile` on the host:

```caddyfile
yourdomain.com {
    reverse_proxy localhost:8080
}
api.yourdomain.com {
    reverse_proxy localhost:9000
}
```

Update `.env.deploy` to reflect real externally-visible URLs, then restart:

```bash
# PUBLIC_BACKEND_URL=https://api.yourdomain.com
# STORE_CORS=https://yourdomain.com
# ADMIN_CORS=https://yourdomain.com
# AUTH_CORS=https://yourdomain.com
# NEXT_PUBLIC_BASE_URL=https://yourdomain.com
docker compose --env-file .env.deploy -f docker-compose.prod.yml up -d --build
```

> Next.js inlines `NEXT_PUBLIC_*` at build time, so changing
> `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_DEFAULT_REGION` requires a rebuild
> (the `--build` above). Non-prefixed runtime vars (`MEDUSA_BACKEND_URL`, CORS)
> only need a restart.

---

## 6. Updates & rollback

```bash
# pull latest code on the host, rebuild, restart
git pull
docker compose --env-file .env.deploy -f docker-compose.prod.yml up -d --build

# rollback to a previous image tag (pin before, e.g. tag your images)
docker compose -f docker-compose.prod.yml up -d
```

Backups: `docker compose exec postgres pg_dump -U howsu howsu > dump.sql`.

---

## 7. Seeding & first admin

The seed script (your `backend/src/scripts/seed.ts`) enables the Nigeria region
and its payment providers and inserts demo catalog/products (12 products). Run
it once after the DB is up:

```bash
docker compose --env-file .env.deploy -f docker-compose.prod.yml run --rm backend \
  yarn medusa exec ./src/scripts/seed.ts
```

Create your admin user for Medusa Admin (optional; the storefront doesn't need it):

```bash
docker compose --env-file .env.deploy -f docker-compose.prod.yml exec backend \
  yarn medusa user -e admin@yourdomain.com -p 'your-strong-password'
```

---

## 8. Health & troubleshooting

| Symptom | Check |
|---------|-------|
| 523 / connection refused on `/store/health` | Backend not migrated yet; check `docker compose logs backend` for the `migrations run` step |
| Storefront loads but product 404 | Stale Next DataCache — hard-restart the frontend container (`docker compose restart frontend`) |
| Missing price/`payment-providers` | Region isn't `ng` (default) — set `NEXT_PUBLIC_DEFAULT_REGION=ng`, rebuild |
| `undefined` env at `up` | Missing required var in `.env.deploy` — the `:?` message names it |
| USDC offers but never charges | `CIRCLE_API_KEY=mock` — offline settlement by design |

---

## Blocking (needs you, not code)

1. **Real Circle keys** — replace `CIRCLE_API_KEY`/`CIRCLE_ENTITY_SECRET`/`CIRCLE_WALLET_SET_ID` (currently `mock`/testnet) to move real USDC.
2. **Real USDC→NGN price** — the oracle is a hardcoded constant (`CRYPTO_NGN_PER_USDC`) in `backend/src/lib/payments/crypto/index.ts`; wire a live feed before live pricing.
3. **Host + TLS** — apply the compose stack to a server and put Caddy/Traefik in front.
4. **Legal/financial copy** — T&C, escrow policy appended, refund deadline copy — needs your business decisions before real orders.