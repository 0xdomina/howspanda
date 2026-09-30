# Agent rules — never break hosted environments

These rules are load-bearing. Follow them on every task unless the user explicitly overrides in writing for that task.

## 0. Medusa migrations never run themselves — apply DDL explicitly

- `medusa start` does NOT run pending migrations. After adding a migration file, apply it with `medusa db:migrate` against the target database — or, when the CLI hangs, run the file's exact `IF NOT EXISTS` statements via a throwaway script (names-only output, delete the script after). The statements are idempotent, so a later file-based run is harmless.
- Verify with the affected endpoint (e.g. new columns visible in API responses), never by assumption.

## 1. Never touch hosted env vars without backup + explicit approval

- Render / PandaStack / Vercel / Neon / Aiven env vars are production state. Never add, update, delete, bulk-PUT, or "restore" them unless the user explicitly asked for that exact change.
- Render's `PUT /env-vars` **replaces the full set**: a partial payload deletes everything missing. Never call `scripts/render-env-restore.ps1`, `render-env-add.ps1`, or the Render env API directly without:
  1. Reading back the live set first (`scripts/render-env-check.ps1`) and saving the key list (names only, never values) to a timestamped local backup note.
  2. Confirming the exact key diff with the user.
  3. Re-verifying key count + `/health` after the change.
- Never print or commit secret values. Real keys live only in each host's encrypted dashboard and git-ignored `.env` files (see `.gitignore`). Templates (`backend/.env.template`, `.env.deploy.example`) carry placeholders only.

## 2. Never run upgrades / updates unasked

- Never run `apt-get upgrade/dist-upgrade`, `npm update`, `yarn upgrade`, `medusa update/migrate-force`, or bump `package.json` / `Dockerfile` base images unless the user explicitly requested that upgrade.
- Dependency and Node-image changes (backend requires Node >= 22.12) can take down Render/PandaStack builds. Prefer pinned versions; propose upgrades as a plan first, with rollback noted.
- Never reboot, redeploy, or change branches on a hosted service (`render-redeploy.ps1`, `render-set-branch.ps1`) without explicit approval.

## 3. Deploy safely

- Backend boot in production fails fast on missing `DATABASE_URL`, `STORE_CORS`/`ADMIN_CORS`/`AUTH_CORS`, `JWT_SECRET`/`COOKIE_SECRET`, private proof-bucket vars, or Redis (`KV_URL`/`REDIS_URL`) — see `backend/medusa-config.ts`. Check these before any deploy-related change.
- After any infra-adjacent change: `git status --short`, confirm no `.env` / secret files staged, run the relevant smoke script (`scripts/test-render-main.mjs`, `/health`), and report what was NOT touched.

## 4. Product copy standard (platform-wide)

Every user-facing string — labels, buttons, errors, empty states, notifications, emails, toasts, feedback messages, thread messages — follows these rules:

1. **Short first.** One line where possible, two at most. Cut anything the user cannot act on.
2. **No em dashes or double hyphens joining clauses.** Use a period.
3. **No explainers, no mechanics, no T&Cs in UI.** Campaign and legal terms ship in launch comms, never in screens.
4. **No dev-speak.** No protocol tokens, codes, refs or IDs (unless support needs them). No infra names. No "simply" or "just".
5. **Errors state what happened plus the single next step.** ("Add a bank account first." — never a two-clause instruction.)
6. **Money about the reader's own money names the amount.** ("₦50,000 refunded to wallet.") Never show one party's amounts to another party. Mask sensitive values (••••1234).
7. **When touching any screen, revisit its adjacent strings to this standard.**
