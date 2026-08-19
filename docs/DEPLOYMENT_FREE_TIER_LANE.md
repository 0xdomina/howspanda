# How's U beta deployment lane

This is the launch lane for the first 1,000 beta users. It keeps the public
storefront and seller workspace responsive while the Medusa API, worker jobs,
database, cache, and media storage have clear ownership boundaries.

## Runtime map

```text
Buyer / seller browser
        |
        +--> Vercel project 1: Next.js storefront + Manage Business
        |        |
        |        +--> PandaStack: Medusa API + worker jobs
        |                     |
        |                     +--> Neon: PostgreSQL
        |                     +--> Aiven: Valkey/Redis
        |                     +--> Backblaze B2: public product media
        |                     +--> Backblaze B2: private payment proofs
        |
        +--> optional Vercel project 2: Medusa Operations Console
                 (static admin build, calls the same PandaStack API)
```

The seller-facing “Manage Business” area is part of the storefront. It is the
place store owners and permitted staff manage products, orders, presentation,
team access, payouts, malls, redeemables, delivery, reviews, and Seller AI.
The separate Operations Console is for platform operators, not a second seller
dashboard.

## Project settings

### Vercel project 1 — storefront

- Root directory: `frontend`
- Framework: Next.js
- Build command: `npm run build`
- Install command: `npm ci`
- Environment: `MEDUSA_BACKEND_URL`,
  `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BASE_URL`,
  `NEXT_PUBLIC_DEFAULT_REGION`, and `MEDIA_IMAGE_HOSTNAMES`
- Preview deployments may use a preview URL, but that URL must be added to
  backend `STORE_CORS`, `AUTH_CORS`, and `ADMIN_CORS` only when it is needed.

### Optional Vercel project 2 — Operations Console

- Root directory: `backend`
- Build command: `npm run build:admin`
- Output directory: `.medusa/admin`
- Environment: `MEDUSA_ADMIN_BACKEND_URL=https://api.example.com` and
  `MEDUSA_ADMIN_PATH=/`
- Never put `DATABASE_URL`, Redis credentials, Circle secrets, B2 private keys,
  payment keys, or AI provider keys in this Vercel project.

The repository includes `backend/vercel.json` and the `build:admin` script for
this project. The normal backend still serves `/app` unless the separate build
overrides the path.

### PandaStack — API and worker

- Root directory: `backend`
- Node.js: 22.12 or newer
- Start command: `npm run start`
- Listen on `0.0.0.0` and the port supplied by the platform.
- Keep the Medusa API and scheduled worker jobs on the same service for the
  beta, or use a second small process once scheduled work grows.
- Put all backend variables from `.env.deploy.example` in PandaStack's encrypted
  environment settings. The PandaStack control-plane token is deployment-only
  and must never be passed to the Medusa runtime or the browser.
- Connect the deploy to the `dev` branch first; promote to `main` only after
  the smoke suite below passes.

### Neon — PostgreSQL

Use one beta project with connection pooling enabled for application traffic.
Keep a separate preview branch/database for schema checks. The current Neon
free plan advertises 0.5 GB per project and 100 CU-hours per month, with
scale-to-zero; that is suitable for a controlled beta, not a capacity promise.

### Aiven — Valkey/Redis

Use Valkey for Medusa event-bus/workflow queues and short-lived cache state.
Do not treat it as durable business data. The Aiven free Valkey tier is a
single-node, no-SLA service with 1 GB RAM and a 50% max-memory setting, so set
TTL on cache keys and monitor evictions. If the free service is unavailable,
commerce data must remain safe in Neon and the app should surface a retryable
error for background work.

### Backblaze B2

Use separate buckets or prefixes:

- public, cacheable product/store media;
- private payment-proof images, read only through short-lived signed URLs.

Never reuse the public media bucket for payment proofs. Product uploads are
untrusted media and are sniffed server-side; SVG/HTML are not accepted.

## Free-tier reality and capacity posture

This lane is cost-conscious, not a guarantee of unlimited capacity. Medusa's
general deployment guidance calls for at least 2 GB RAM for a comfortable
server/worker process. PandaStack's free container is scale-to-zero, so
the beta must be protected by bounded uploads, request rate limits, short cache
TTLs, paginated seller lists, and no unbounded synchronous AI work.

For 20–30 concurrent checkout attempts:

1. Keep checkout server-authoritative and idempotent.
2. Let Neon handle durable order/payment state; never use Redis as the source
   of truth.
3. Keep AI off the checkout critical path.
4. Cap image uploads and use B2 rather than local disk.
5. Monitor memory, database connections, Redis memory, error rate, and queue
   lag; pause new beta invites before the free tier is exhausted.

When the beta approaches the free-tier limits, the first paid upgrade should
be backend memory/worker capacity, then database capacity. The frontend can
remain on Vercel while those limits are increased independently.

## Release and rollback lane

1. Work on a feature branch.
2. Merge to `dev`; Vercel creates a preview and PandaStack deploys the beta
   environment.
3. Run the frontend build, backend build, migration dry-run/preflight, and the
   smoke flow: sign in, browse, add to cart, checkout, submit bank proof, seller
   confirm/reject, seller product upload, courier KYC gate, and Manage Business.
4. Promote the verified commit to `main`.
5. Apply forward-only migrations before code that depends on them. Take a Neon
   backup/export before production schema changes.
6. If a release misbehaves, roll back the application commit first. Do not
   point the live app at a different database without schema parity.

The deployment variables are intentionally templates only. Real keys are
provided through each host's encrypted environment settings, never through
Git, browser code, or chat.

## Direct bank-transfer beta rail

This rail is deliberately limited to one seller per cart and only appears when
that seller has a verified default payout account. At checkout the API snapshots
the account and creates a unique order reference. The buyer sees the account,
exact total, and reference, then uploads an image proof.

The proof is only a claim. A seller must check the actual bank account and may
confirm or reject it. A buyer cannot mark an order paid, change the destination
account, change the order total, or force fulfillment. A rejection opens a
24-hour recheck window for delayed transfers; unresolved orders are closed by
the scheduled job. Screenshot evidence alone never releases money.

The payment-proof table has a forward-only uniqueness guard for `(order_id,
seller_id)`. Its migration refuses to proceed if old data contains duplicate
live proofs, so payment evidence is not silently deleted during deployment.

For the beta, show buyers a clear “payment pending store confirmation” state,
show sellers the bank-ledger warning before confirmation, and route disputes to
platform support. When Paystack live keys are available, enable the hosted
rail and keep bank transfer as a clearly-labelled fallback rather than hiding
the payment state.

## Reference limits

- [PandaStack API reference](https://docs.pandastack.io/api)
- [PandaStack deployment quick start](https://docs.pandastack.io/start/quickstart)
- [Neon pricing](https://neon.com/pricing)
- [Aiven Valkey free tier](https://aiven.io/docs/products/valkey/concepts/valkey-free-tier)
- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
- [Medusa deployment guidance](https://docs.medusajs.com/learn/deployment/general)
