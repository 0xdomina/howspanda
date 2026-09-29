# Telegram seller secretary — plan (full store manager, payouts excluded)

## Goal

Turn the existing order-alert bot into a conversational store manager: sellers
create/edit products, triage orders, update store presentation, and check
reviews/redeemables from Telegram. Payouts and money movement stay in
Manage Business only.

## What exists

- `backend/src/lib/telegram/notify.ts` — Bot API send, link helpers.
- `backend/src/api/telegram/webhook/route.ts` — `/start <code>` link handshake.
- `seller.telegram_chat_id` — per-store binding (`Migration20260912090000`).
- Seller link UI in `frontend/src/modules/seller/templates/seller-settings.tsx`.
- Product create/edit workflows + seller permission layer
  (`requireSellerPermission`, `createSellerProductWorkflow`).

## Scope

IN: `/products /new /edit /orders /store /reviews /help /cancel /unlink`,
photo upload via chat, order status actions (deliver / return-received /
bank-proof confirm-reject view), store presentation edits (owner-only),
read-only summaries for referrals/tips/redeemables.
OUT: payouts, payout accounts, commission reversal, admin actions. Bot replies
with a Manage Business deep link for those.

## Phases

1. Router + session (shipped): command router in the webhook, in-memory
   10-min session per chat, `/help /cancel /products /new` fully working.
   No DB migration (single-instance safe; avoids Neon risk).
2. Edit flow (shipped): `/edit` picker + title/price/stock/photo/description/
   status patch via `updateSellerProductWorkflow`. Multi-variant price/stock
   is redirected to Manage Business; archived maps to draft as in the API.
3. Orders: read-only list + inline deliver / return-received / proof view.
4. Store/reviews/redeemables: owner-gated presentation edits, review replies.
5. Polish: AI listing assist, staff-level linking, Redis-backed sessions for
   multi-instance, audit log.

## Auth model

- Chat is bound to a store (`telegram_chat_id`). Secretary resolves the
  store's owner `seller_admin` as actor and enforces `sellerHasPermission`
  per command. Staff chats are a later phase; today one linked chat = store.
- Webhook keeps secret-token check + OTP rate limit. All writes require an
  explicit confirm step. Payout keywords get a redirect reply, never an action.

## Product flow (`/new`)

`title → price (₦ major, ×100 to minor) → stock → photos (0–4) → description
→ confirm → createSellerProductWorkflow`. Photo bytes come from Telegram
`getFile`, sniffed with the existing upload sniffer, stored via FILE service
(S3/B2) or local `uploads/image/` in dev. Price input accepts `2500`, `₦2,500`,
`2,500.50`.

## Rollout

Ship behind existing `TELEGRAM_BOT_TOKEN`; no new env required. Verify with a
fresh link code → `/new` on staging, confirm product appears in Manage Business,
then enable webhook on production. Payout exclusion is enforced in the router
(`payout|withdraw|bank account` → redirect reply).
