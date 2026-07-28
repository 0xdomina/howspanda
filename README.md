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
