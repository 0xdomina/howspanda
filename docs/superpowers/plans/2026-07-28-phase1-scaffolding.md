# How's u — Phase 1: Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the How's u platform skeleton — a Medusa v2 backend in `backend/` and the official Next.js storefront in `frontend/` — both running locally against Dockerized PostgreSQL/Redis, as two strictly separate projects.

**Architecture:** Two independent projects in the workspace root communicating only over HTTP. `backend/` is cloned from the official `medusa-starter-default` repo (plain Medusa v2 server — NOT the monorepo that `create-medusa-app` now generates). `frontend/` is cloned from the official `nextjs-starter-medusa` repo. Docker Compose (owned by `backend/`) provides PostgreSQL 16 and Redis 7.

**Tech Stack:** Medusa v2 (Node.js/TypeScript), Next.js (App Router), PostgreSQL 16, Redis 7, Docker Compose. Shell is Windows PowerShell (use `;` not `&&`).

**Prerequisites (verify before Task 1):** Node.js v20+ (`node -v`), Docker Desktop running (`docker info`), Git (`git --version`). The workspace root is `c:\Users\mosho\Desktop\How's you` and already contains a git repo with `docs/`.

**Spec:** `docs/superpowers/specs/2026-07-28-ai-marketplace-design.md`

---

### Task 1: Scaffold the backend from the official Medusa starter

**Files:**
- Create: `backend/` (entire directory, cloned from `medusajs/medusa-starter-default`)

- [ ] **Step 1: Clone the official Medusa v2 starter into `backend/`**

Run from workspace root:
```powershell
git clone --depth 1 https://github.com/medusajs/medusa-starter-default.git backend
```
Expected: `Cloning into 'backend'...` finishing without error.

- [ ] **Step 2: Detach it from the starter's git history (it becomes part of OUR repo)**

```powershell
Remove-Item -Recurse -Force "backend\.git"
```
Expected: no output. Verify with `Test-Path "backend\.git"` → `False`.
(This deletes only the cloned starter's internal `.git` folder — required so `backend/` is tracked by the root How's u repository.)

- [ ] **Step 3: Verify the starter is Medusa v2 and inspect the layout**

```powershell
Get-Content "backend\package.json"
```
Expected: `@medusajs/framework` and `@medusajs/medusa` dependencies at version `2.x`. Note the scripts: `dev`, `build`, `seed`, `start`.

- [ ] **Step 4: Install backend dependencies**

```powershell
cd backend; npm install; cd ..
```
Expected: completes without `ERESOLVE` errors (warnings are fine). A `backend/node_modules/` directory exists.

- [ ] **Step 5: Commit the untouched scaffold**

```powershell
git add backend; git commit -m "feat(backend): scaffold Medusa v2 server from official starter"
```
Expected: commit succeeds; `node_modules` is excluded by the starter's own `backend/.gitignore` (verify the commit lists no `node_modules` paths).

---

### Task 2: Local infrastructure — PostgreSQL + Redis via Docker

**Files:**
- Create: `backend/docker-compose.yml`

- [ ] **Step 1: Write the compose file**

Create `backend/docker-compose.yml`:
```yaml
name: howsu

services:
  postgres:
    image: postgres:16-alpine
    container_name: howsu-postgres
    environment:
      POSTGRES_USER: howsu
      POSTGRES_PASSWORD: howsu_dev_password
      POSTGRES_DB: howsu
    ports:
      - "5432:5432"
    volumes:
      - howsu_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U howsu -d howsu"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: howsu-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  howsu_pgdata:
```

- [ ] **Step 2: Start and verify both services**

```powershell
cd backend; docker compose up -d; docker compose ps; cd ..
```
Expected: both `howsu-postgres` and `howsu-redis` show `Up (healthy)` (re-run `docker compose ps` after ~15s if still `starting`).

- [ ] **Step 3: Commit**

```powershell
git add backend/docker-compose.yml; git commit -m "feat(backend): add dockerized postgres and redis"
```

---

### Task 3: Backend environment configuration

**Files:**
- Create: `backend/.env` (NOT committed — secrets stay out of git)
- Modify: `backend/.env.template` (committed reference for contributors)

- [ ] **Step 1: Create `backend/.env`**

```env
# How's u backend — local development environment
DATABASE_URL=postgres://howsu:howsu_dev_password@localhost:5432/howsu
REDIS_URL=redis://localhost:6379
JWT_SECRET=howsu_dev_jwt_secret_change_in_prod
COOKIE_SECRET=howsu_dev_cookie_secret_change_in_prod
STORE_CORS=http://localhost:8000
ADMIN_CORS=http://localhost:9000,http://localhost:5173
AUTH_CORS=http://localhost:8000,http://localhost:9000,http://localhost:5173
```

- [ ] **Step 2: Mirror it (without real values needed) into `backend/.env.template`**

Overwrite the starter's `backend/.env.template` with:
```env
DATABASE_URL=postgres://howsu:howsu_dev_password@localhost:5432/howsu
REDIS_URL=redis://localhost:6379
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret
STORE_CORS=http://localhost:8000
ADMIN_CORS=http://localhost:9000,http://localhost:5173
AUTH_CORS=http://localhost:8000,http://localhost:9000,http://localhost:5173
```

- [ ] **Step 3: Confirm `.env` is gitignored**

```powershell
git check-ignore backend/.env
```
Expected output: `backend/.env`. If NOT ignored, append `.env` to `backend/.gitignore` before proceeding.

- [ ] **Step 4: Commit the template only**

```powershell
git add backend/.env.template backend/.gitignore; git commit -m "chore(backend): configure local env template"
```
Expected: commit contains `.env.template` but NOT `.env` (verify with `git show --stat HEAD`).

---

### Task 4: Database migrations, admin user, seed data, first run

**Files:**
- No new files — runs Medusa CLI against `backend/`

- [ ] **Step 1: Run migrations (creates all Medusa v2 tables)**

```powershell
cd backend; npx medusa db:migrate
```
Expected: a series of `Migrating...` lines ending without error.

- [ ] **Step 2: Create the platform admin user**

```powershell
npx medusa user -e admin@howsu.local -p howsu_admin_dev
```
Expected: `User created` (or similar success message).

- [ ] **Step 3: Seed demo data (products, region, sales channel, publishable key)**

```powershell
npm run seed
```
Expected: seed script finishes with `Seed completed` / no errors. This creates demo products and a publishable API key needed by the storefront.

- [ ] **Step 4: Start the backend and verify health**

```powershell
npm run dev
```
Run in background/second terminal. Then verify:
```powershell
Invoke-WebRequest http://localhost:9000/health | Select-Object -ExpandProperty StatusCode
```
Expected: `200`. Also open `http://localhost:9000/app` in a browser and log in with `admin@howsu.local` / `howsu_admin_dev` — the Medusa admin dashboard loads with seeded products visible.

- [ ] **Step 5: Retrieve the publishable API key (needed by Task 5)**

In the admin dashboard: **Settings → Publishable API Keys** → copy the key that the seed created (starts with `pk_`). Keep it for Task 5 Step 3.

- [ ] **Step 6: Commit any lockfile changes**

```powershell
cd ..; git add backend; git commit -m "chore(backend): first run - migrations, admin user, seed" --allow-empty
```

---

### Task 5: Scaffold the frontend storefront

**Files:**
- Create: `frontend/` (entire directory, cloned from `medusajs/nextjs-starter-medusa`)
- Create: `frontend/.env.local` (NOT committed)

- [ ] **Step 1: Clone the official Next.js storefront into `frontend/`**

Run from workspace root:
```powershell
git clone --depth 1 https://github.com/medusajs/nextjs-starter-medusa.git frontend
Remove-Item -Recurse -Force "frontend\.git"
```
Expected: clone succeeds; `Test-Path "frontend\.git"` → `False`.

- [ ] **Step 2: Install frontend dependencies**

```powershell
cd frontend; npm install; cd ..
```
Expected: completes without fatal errors.

- [ ] **Step 3: Create `frontend/.env.local`**

```env
MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_PASTE_KEY_FROM_TASK_4_STEP_5
NEXT_PUBLIC_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEFAULT_REGION=ng
```
Replace `pk_PASTE_KEY_FROM_TASK_4_STEP_5` with the real key copied in Task 4. Note: if the seeded region does not include Nigeria yet, set `NEXT_PUBLIC_DEFAULT_REGION` to the seeded region's country code (check `frontend/.env.template` default, usually `us`) — NGN region setup is a Phase 4 (Paystack) concern.

- [ ] **Step 4: Verify `.env.local` is gitignored**

```powershell
git check-ignore frontend/.env.local
```
Expected output: `frontend/.env.local`.

- [ ] **Step 5: Run the storefront (backend must be running)**

```powershell
cd frontend; npm run dev
```
Expected: Next.js starts on `http://localhost:8000`. Open it — the storefront homepage renders with seeded demo products, and clicking a product shows its detail page. If products don't load, re-check the publishable key and that the backend is up.

- [ ] **Step 6: Commit**

```powershell
cd ..; git add frontend; git commit -m "feat(frontend): scaffold Next.js storefront from official starter"
```
Expected: commit lists no `node_modules` or `.env.local` paths.

---

### Task 6: Brand as "How's u" + root housekeeping

**Files:**
- Modify: `frontend/src/app/layout.tsx` (site metadata)
- Create: `README.md` (workspace root)

- [ ] **Step 1: Set storefront metadata title to How's u**

In `frontend/src/app/layout.tsx`, find the exported `metadata` object and set the title, e.g. change:
```tsx
export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}
```
to:
```tsx
export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
  title: {
    template: "%s | How's u",
    default: "How's u — Shop more. Sell more.",
  },
  description:
    "How's u is an AI-powered marketplace that helps people shop more and sell more.",
}
```
(If the starter's `metadata` already defines `title`/`description`, replace those values instead of adding duplicates.)

- [ ] **Step 2: Verify in browser**

With `npm run dev` running in `frontend/`, reload `http://localhost:8000` — the browser tab reads "How's u — Shop more. Sell more."

- [ ] **Step 3: Write the root `README.md`**

```markdown
# How's u

AI-powered multi-vendor marketplace — shop more, sell more.

## Structure

- `backend/` — Medusa v2 server: all commerce logic, marketplace layer, AI module. Fully independent.
- `frontend/` — Next.js storefront (scaffolding; custom design coming later). Talks to the backend over HTTP only.
- `docs/` — specs and implementation plans.

## Run locally

1. Infrastructure: `cd backend; docker compose up -d`
2. Backend: `cd backend; npm run dev` → API http://localhost:9000, admin http://localhost:9000/app
3. Storefront: `cd frontend; npm run dev` → http://localhost:8000

Environment files: copy `backend/.env.template` → `backend/.env`; create `frontend/.env.local` with your publishable API key (Admin → Settings → Publishable API Keys). Never commit `.env*` files with real secrets.
```

- [ ] **Step 4: Commit**

```powershell
git add README.md frontend/src/app/layout.tsx; git commit -m "feat: brand storefront as How's u and add root README"
```

---

### Task 7: Separation verification (spec success criterion)

**Files:** none — verification only

- [ ] **Step 1: Prove the backend does not depend on the frontend**

```powershell
Rename-Item frontend frontend_tmp
```
Restart the backend (`cd backend; npm run dev`) and check:
```powershell
Invoke-WebRequest http://localhost:9000/health | Select-Object -ExpandProperty StatusCode
```
Expected: `200` — backend fully functional with no `frontend/` present.

- [ ] **Step 2: Restore the frontend**

```powershell
Rename-Item frontend_tmp frontend
```

- [ ] **Step 3: Confirm clean tree and phase completion**

```powershell
git status
```
Expected: working tree clean (only untracked `.env` files at most, which must remain untracked).

---

## Out of Scope for This Plan (subsequent plans)

- **Phase 2 plan:** Marketplace module — seller entity, product ownership links, order splitting workflow, commission ledger (+ integration tests).
- **Phase 3 plan:** AI module — Vercel AI SDK provider abstraction (Groq first), per-seller agent context isolation, 5 launch capabilities, quota system (+ tests).
- **Phase 4 plan:** Paystack payment provider (test mode), NGN region setup.
