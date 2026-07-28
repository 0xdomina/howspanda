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

## Marketplace API (Phase 2)

Sellers are a custom `seller` actor type. Flow:

1. `POST /auth/seller/emailpass/register` → registration JWT
2. `POST /sellers` (Bearer registration JWT) → create seller + admin
3. `POST /auth/seller/emailpass` → authenticated JWT
4. `GET /sellers/me` · `POST|GET /sellers/products` · `GET /sellers/orders` · `GET /sellers/commissions`

Checkout uses `POST /store/carts/:id/complete-marketplace`: carts spanning N sellers
produce 1 parent order + N child seller orders, and a pending commission line
(default 10%, per-seller `commission_rate`) is recorded for each seller order.
