# Split-infra fix — Vercel (frontend) + Pandastack (backend) + Neon

Your register OTP never arrived + no OTP input showed because of two split-infra env mismatches:

## 1) Vercel frontend never reached the backend
`MEDUSA_BACKEND_URL` on Vercel was still `http://localhost:9000` (template default). From the browser, `POST https://hows-u.vercel.app → http://localhost:9000/auth/otp/request` fails silently — no OTP created, no input shown.

**Fix on Vercel → Settings → Environment Variables:**
```
MEDUSA_BACKEND_URL=https://<your-pandastack-backend-host>
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...   (the real publishable key from backend sales channel)
NEXT_PUBLIC_BASE_URL=https://hows-u.vercel.app
NEXT_PUBLIC_DEFAULT_REGION=ng
```
Redeploy after saving. No code change needed — `frontend/src/lib/config.ts:5` reads this at build + runtime.

## 2) Pandastack backend was running with KYC delivery OFF
`backend/.env.template` ships with `KYC_VERIFICATION_ENABLED=false` and `NOTIFICATIONS_CHANNEL` commented out. If you deployed Pandastack without overriding those in the dashboard, every `POST /auth/otp/request` creates a hash and stores it but `sendOtp()` returns `null` — frontend shows “sent” but Brevo never sends. In production the new guard now throws `Email verification is not configured…` so you’ll see a real error instead of silence.

**Fix on Pandastack → Service → Environment:**
```
KYC_VERIFICATION_ENABLED=true
KYC_VERIFICATION_CHANNEL=email
NOTIFICATIONS_EMAIL_ENABLED=true
NOTIFICATIONS_CHANNEL=brevo
EMAIL_FROM=no-reply@howsu.com
BREVO_FROM_NAME=How's U
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=b4bc5b001@smtp-brevo.com
BREVO_SMTP_PASS=<your brevo SMTP key — never commit it, paste from dashboard → SMTP & API → SMTP keys>
STORE_CORS=https://hows-u.vercel.app,http://localhost:8000
AUTH_CORS=https://hows-u.vercel.app,http://localhost:8000,http://localhost:9000
ADMIN_CORS=https://<pandastack-backend-host>,http://localhost:9000
# plus the secrets Pandastack already set: DATABASE_URL, JWT_SECRET, COOKIE_SECRET, KV_URL, PRIVATE_S3_*, etc.
```
Brevo sender `no-reply@howsu.com` does **not** need a mailbox — Brevo only checks that the *domain* `howsu.com` is verified via DNS, not that the inbox exists. Until verified, Brevo accepts SMTP login but silently drops the mail (you’ll see no error, no inbox).

To verify (2 min, once):
Brevo → Settings → Senders & Domains → Domains → Add `howsu.com` → add the 3 TXT records (DKIM + SPF + DMARC) to your DNS (Cloudflare/vercel-dns/etc.) → Verify. Until DNS propagates, you can temporarily set `EMAIL_FROM` to the Brevo account email that is already verified (check Brevo → Senders) — OTP will show that sender name but `How's U` as display name, which we set via `BREVO_FROM_NAME`.

No secret was committed. `backend/.env` (with your real `BREVO_SMTP_PASS`) stays git-ignored; only `backend/.env.template` documents placeholders. `PANDASTACK_TOKEN`/`VERCEL_TOKEN` stay in root `.env` (ignored).
After verification, Pandastack Logs will show `sendEmail:brevo messageId=<...>` on each `POST /auth/otp/request`.

## 3) UX polish shipped in this commit
- `frontend/src/modules/account/components/register/index.tsx` now auto-sends OTP when you reach step 2, shows a 6-box animated input, resend countdown (45s), glass panel + hint “check Spam / add no-reply@howsu.com”.
- `frontend/src/modules/account/components/verification/index.tsx:EmailStep` same treatment.
- `backend/src/lib/kyc/send-otp.ts:20` now throws in production when verification is OFF so misconfig is visible instead of silent.
- `frontend/src/styles/globals.css` already has `.glass-panel`/`.soft-glass` — now used on OTP cards.

## Quick verify after redeploy
1. Open https://hows-u.vercel.app/ng → Join → fill email → Continue → you should see “We sent a code…” + 6 boxes within 1s (auto-send). Inbox: code from How’s U in < 30s. Spam folder included.
2. Pandastack → Logs → search `requestOtp` — should show no error. If you see `BREVO_SMTP_* not configured`, the env above is missing.
3. Brevo → Statistics → Emails → should show 1 sent.

No secret was committed. `backend/.env` (with your real `BREVO_SMTP_PASS`) stays git-ignored; only `backend/.env.template` documents placeholders.
