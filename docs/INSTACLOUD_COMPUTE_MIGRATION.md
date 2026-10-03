# InstaCloud compute migration — backend only (EXECUTED 2026-09-30, cutover live)

> Status: cutover complete. Live backend =
> `prod-main-api-2feb70-0034wf7vg1z.compute.instacloud-edge.com`
> (project `hows-u-backend`, service `api`, us-east, always-on, ceiling
> 1 vCPU / 1 GB). Render service **suspended** (not deleted) as warm standby.
> Telegram webhook + Vercel frontend both point at InstaCloud.

## Goal

Move backend **compute** off Render free (sleep/cold-starts, 750 hrs/mo cap,
API-only deploys) to InstaCloud, keeping everything else where it is:

| Layer | Stays | Moves |
|---|---|---|
| Frontend | Vercel (`hows-u`) | — |
| Postgres | Neon | — |
| Redis/Valkey | Aiven | — |
| Media (public + proofs) | Backblaze B2 | — |
| Backend compute | Render free | **InstaCloud compute service** |
| Builds | Docker image (Dockerfile) | — |

No data migration (`pg_dump` not needed — Neon/Aiven/B2 stay put). No schema
changes. The backend already reaches all datastores over public internet.

## Prerequisites (user)

- [ ] InstaCloud account (free tier = $10 usage credit/mo, refreshes monthly)
- [ ] `insta_…` API key handed to the agent (CLI auth; no browser OAuth needed)
- [ ] Confirm InstaCloud Postgres idle behavior (does the DB service scale to
      zero, or bill always-on? decides credit headroom — backend-only move is
      unaffected either way since our DBs stay external)

## Phase 0 — Backup (read-only, no changes)

1. `scripts/render-env-check.ps1` → save the 82-key **name list** with timestamp
   to a local note (names only, never values).
2. Record live state: Render deploy id, commit, `/health` output.

## Phase 1 — Provision (explicit approval required)

1. `npm install -g insta` (or `npx -y insta@latest`), `insta login --api-key …`
2. `insta project create hows-u-backend`
3. `insta services add compute api --port 9000` (backend `Dockerfile` exists;
   remote build, no local Docker). Start with scale-to-zero (default), 1 vCPU /
   1 GB cap inside free limits (4 vCPU / 4 GB / 1 GB volume).
4. Re-enter env vars in InstaCloud dashboard/CLI by **name-matching** the backup
   list (82 keys: `DATABASE_URL` → Neon, `REDIS_URL` → Aiven, `S3_*` /
   `PRIVATE_S3_*` → B2, CORS URLs, `JWT_SECRET`/`COOKIE_SECRET`,
   `TELEGRAM_*`, Paystack/Flutterwave/Circle, AI keys, feature flags).
   Values come from the current Render dashboard or local `.env` — never
   committed, never printed.
5. `insta deploy ./backend` to a preview/branch first if available; else deploy
   and do NOT cut traffic yet.

## Phase 2 — Verify on InstaCloud URL (before cutover)

1. `/health` → expect `200 {"ok":true,"ready":true}` (same warmup-proxy shape).
2. `/store/products?limit=1` with publishable key → `200` with products.
3. Seller auth spot-check: link-code handshake **read** path only
   (`POST /sellers/me/telegram-link` mints a code — use a test seller, then
   discard; do not link the real bot yet).
4. Category round-trip: create draft product with `category_ids` via seller API,
   confirm, delete. (Exercises the newest code on the new host.)

## Phase 3 — Cutover (explicit approval required)

1. Re-register Telegram webhook to the InstaCloud URL with a fresh
   `TELEGRAM_WEBHOOK_SECRET` (`setWebhook`; keep Render URL unregistered only
   after confirming delivery on the new host — Telegram allows one webhook URL,
   so this is the point of no return for the bot).
2. Point frontend `MEDUSA_BACKEND_URL` / `NEXT_PUBLIC_MEDUSA_BACKEND_URL`
   (Vercel env) at the new host; redeploy frontend via Vercel.
3. Update `STOREFRONT_URL` / CORS vars on the new backend if host-derived.
4. Smoke: storefront product page, seller login, cart → order, Telegram `/help`
   on the linked bot.

## Phase 4 — Rollback (if anything fails)

1. Re-register Telegram webhook back to `hows-u-api.onrender.com`.
2. Revert Vercel backend URL env vars; redeploy frontend.
3. Render service + Neon/Aiven/B2 are untouched throughout, so rollback is
   config-only, no data loss. Keep the Render service **suspended, not
   deleted**, for one billing cycle as warm standby.

## Cost guardrails

- InstaCloud free pauses projects when the $10 credit exhausts — set usage
  alerts on day 1; expected beta burn (scale-to-zero backend, external DBs) is
  a fraction of the credit, but egress ($0.05/GB) and any always-on setting
  change the math.
- If credit proves tight: cap vCPU/RAM lower, keep scale-to-zero on, move
  heavy media off the API host (already on B2 — nothing to do).

## Out of scope (deliberately)

- Moving Postgres/Redis/media or frontend hosts.
- Render Postgres 30-day expiry: not applicable (data is on Neon).
