# How's U security audit — 2026-08-17

## Scope

Local repository audit covering the Medusa backend, Next.js storefront, custom
admin/store/seller routes, media uploads, payment and wallet paths, environment
templates, dependency advisories, and the root `.mimosa` scanner workspace.
No production credentials, Circle wallet creation, funds movement, or destructive
remote testing was performed.

## Remediated in this pass

- Added explicit `user` authentication to every custom `/admin/*` route. The
  previous middleware only throttled those routes and did not add an explicit
  guard.
- Added upload rate limits for seller media and guest-compatible bank-proof
  uploads.
- Kept byte-level media sniffing, generated filenames, size caps, and `nosniff`
  headers; restricted bank-proof URLs to local proof uploads or the configured
  HTTPS B2 origin.
- Routed bank-proof uploads to the configured S3-compatible provider when B2 is
  enabled, while preserving local development behavior.
- Installed Circle's developer-controlled wallet SDK, moved the integration to
  the current SDK transaction shape, added deterministic idempotency keys, and
  persisted a provider transaction ID for asynchronous status polling.
- Made Circle deposit wallet provisioning find-or-create by reference so a
  payment session cannot create a different wallet during the pay flow.
- Added validation for Circle's registered 32-byte hex entity secret and the
  required wallet-set ID. Circle credentials remain backend-only.
- Added production security response headers to the storefront and upgraded
  the pinned Next.js/PostCSS dependency set; the frontend production audit now
  reports zero vulnerabilities.
- Added `.mimosa/` to `.gitignore`; its session state is local audit metadata,
  not deployable application code or a safe artifact to commit.

## Findings that remain before production

1. The backend dependency audit still reports inherited vulnerabilities from
   the pinned Medusa 2.18 / AI dependency graph (16 high, 65 moderate, 5 low
   in the current `npm audit --omit=dev` result). `npm audit fix --force` would
   cross breaking Medusa and AI versions, so this needs a planned dependency
   upgrade and full commerce/auth regression pass rather than an automatic
   force-upgrade.
2. Bank proofs use the same public B2 media provider when B2 is configured. Use
   a separate private B2 bucket plus authenticated signed-download handling
   before treating bank proof images as confidential financial records.
3. Circle entity-secret generation/registration, recovery-file custody, wallet
   set creation, testnet funding, webhook configuration, and live/mainnet
   approval remain operator actions. No real key is stored in this repository.
4. `CRYPTO_NGN_PER_USDC` is still a fixed PoC quote. Live crypto checkout must
   use a trusted, bounded rate source with stale-rate handling before launch.
5. The repository has only `master`; no `dev`, `security-lab`, deploy workflow,
   or `pb_hooks` directory exists. This pass is committed on the dedicated
   feature branch created from the existing baseline, and the missing lane
   bootstrap should be addressed before production promotion.

## `.mimosa` result

`.mimosa` is a root directory containing hook state/status files, not a backend
configuration file. The recent status record reports `outcome: clear`,
`coverage: complete`, and `findingCount: 0`. It is ignored and was not modified.

## Verification

- Backend TypeScript: passed with `npx tsc --noEmit`.
- Frontend TypeScript: passed with `npx tsc --noEmit`.
- Backend build: passed with `npm run build`.
- Frontend build: passed with `npm run build`.
- Frontend lint: 0 errors, 18 existing warnings.
- Focused backend unit suite: 5 tests passed.
- Frontend dependency audit: passed with zero vulnerabilities.
- Backend dependency audit: documented above; no force upgrade applied.
- Authenticated live route checks remain dependent on a running Postgres/Redis
  environment and were not run against production.
