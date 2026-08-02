# How's u — Frontend UI Scope Plan

**Date:** 2026-08-02
**Status:** For approval — no UI written yet.
**Goal:** Map every backend feature that exists today to the frontend page(s) it's missing, so we can decide what to surface and in what order.

---

## 1. The core finding

The backend has a large, fully-tested feature surface:
- **Sellers / store management** — create store, add/edit products (title, photo, price, size/quantity/stock via variants), orders, payouts, commission, balance, reviews, tips, redeemables, referrals, AI tools.
- **Couriers / delivery** — post a delivery job, courier offers, accept, pickup code, delivery verify, chat, courier wallet payout.
- **Malls** — create a mall, sellers join, buyers join/purchase, prize pool + go-live.
- **Payments/money** — buyer wallet (credits/withdrawals), escrow hold/release, confirm receipt, request/cancel return.

But **none of it is connected to the frontend**. The storefront is the stock Medusa starter (browse → cart → pay → order). A user or seller navigating the site has **no UI** for any of the above.

The homepage already advertises it ("Buy from people, sell what you make, and earn for every delivery you complete.") — meaning the marketing over-promises current UI.

---

## 2. How the frontend talks to the backend today

- Single JS SDK singleton in `src/lib/config.ts` (`@medusajs/js-sdk`), using `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
- Server-side data helpers in `src/lib/data/*` (cart, products, orders, customer, regions…).
- Auth: Medusa `emailpass` provider for **customers** (buyer) — login/register/orders/profile in the account area.
- **Missing for the features:** a second `seller` auth identity (emailpass/phone bearer) gated by `authenticate("seller", …)`, and raw `fetch` helpers for the custom `/api/sellers/*`, `/store/delivery-jobs/*`, `/store/malls/*`, `/store/wallet/*`, `/store/orders/:id/{tip,review,confirm-receipt,request-return}` routes. These need shared typed API clients on the frontend (search `lib/data` currently has none).

---

## 2. Feature → page map (what exists in backend, what UI is missing)

Legend: **Needed** = new frontend page/component not present today.

### A. Store management (seller side) — highest value
| Backend route(s) | Purpose | Missing frontend |
|---|---|---|
| `POST /api/sellers` (register/onboard) | Create seller account | **Needed:** "Become a seller" onboarding + seller sign-in (separate from customer) |
| `POST/GET /api/sellers/products` | Add/list seller products (title, photo, price, size, qty, stock) | **Needed:** Seller product list + add/edit product form (variants: size `M/L`, inventory qty, price) |
| `GET /api/sellers/orders` + `mark-delivered` + `return-received` | See orders, mark delivery, receive returns | **Needed:** Seller orders dashboard + actions |
| `GET /api/sellers/balance`, `/payouts`, `/payout-accounts` | Balance, request payout, bank/crypto account | **Needed:** Seller money/balance + payout UI + withdrawal account setup |
| `GET /api/sellers/commissions` | Commission ledger | **Needed:** seller commissions view (can fold into balance) |
| `POST /api/sellers/reviews/{id}/reply` | Reply to buyer reviews | **Needed:** seller review inbox + reply |
| `GET /api/sellers/tips`, `POST /sellers/tips` | Seller-given tips (gift product to buyer) | **Needed:** tips UI (can delay) |
| `POST /api/sellers/referrals` | Refer a buyer, gift store code | **Needed:** referral link + invite UI (can delay) |
| `GET/POST /api/sellers/ai/*` (listing, pricing, insights, accounting, marketing, brief, recommendations, quota) | AI seller copilot | **Needed:** seller AI panel (can delay — big separate surface) |
| `GET/POST /api/sellers/redeemables` + `redeem`/`cancel` | Gift cards/vouchers/tickets | **Needed:** redeemables manager (can delay) |

### B. Mall (community sales) — medium value
| Route | Purpose | Missing frontend |
|---|---|---|
| `POST/GET /api/store/malls` (seller) | Create + list malls | **Needed:** seller create-mall + my-malls |
| `POST /api/store/malls/{id}/join` | Seller joins a mall | **Needed:** mall detail + join (seller) |
| `GET /api/store/malls/active`, `POST /malls/{id}/join-buyer`, `purchase` | Active malls, buyers join + buy | **Needed:** public mall browse + buyer join/purchase |
| `POST /api/admin/malls/{id}/go-live` | Admin go-live | Admin (out of storefront scope) |

### C. Couriers / delivery — medium
| Route | Purpose | Missing frontend |
|---|---|---|
| `POST /api/store/delivery-jobs` (seller) | Post a delivery job | **Needed:** seller "arrange delivery" from order |
| `GET /api/store/delivery-jobs` + `{id}` + `/offers` | List jobs, see offers | **Needed:** courier job board + offer list + place offer |
| `POST /offers/{offerId}/accept` (seller) | Accept a courier offer | **Needed:** seller accept |
| `POST /pickup, /verify/pickup, /verify/delivery, /verify` | Pickup + POD codes | **Needed:** courier pickup/POD flow + recipient code entry |
| `POST /chat`, `POST /cancel`, `POST /confirm` | Courier-sender chat, cancel, recipient confirm | **Needed:** job chat + cancel + recipient confirm |
| payout release to courier wallet | automated on confirm | backend only |

### D. Money / buyer wallet & escrow — medium (ties to existing storefront)
| Route | Purpose | Missing frontend |
|---|---|---|
| `GET /api/store/orders/{id}/confirm-receipt`, `request-return`, `cancel-return` | Buyer escrow actions | **Partial — confirm/refund exists; returns/cancel-return not surfaced** |
| `POST /api/store/orders/{id}/tip` | Buyer tips seller | **Needed:** tip control on order |
| `POST /api/store/orders/{id}/review` + `GET /reviews` | Buyer product/store reviews | **Needed:** review form + display |
| `GET /api/store/wallet`, `/withdrawal-accounts`, `/withdrawals` | Buyer wallet + withdraw crypto/bank | **Needed:** buyer wallet + withdraw (can delay) |
| `GET /api/store/referrals` claim | Referral claim | **Needed:** referral entry |

### E. Cross-cutting
- **Auth:** new seller sign-in (emailpass + phone), separate session from customer. Small admin pages (escrow hold/release, go-live, payouts run) are **admin/ops** — delegate, not storefront.

---

## 3. Suggested build order (phases)

1. **Seller foundation** — onboarding + sign-in + product management (add/edit product w/ size+inventory+price). This unlocks *"store can manage their store"* — the single most valuable item.
2. **Buyer money & proof** — confirm-receipt/return surface (partially done), tip, reviews. Completes the existing order page loop.
3. **Seller orders + payouts + balance** — seller dashboard tabs, accepts, waits.
4. **Mall browse + join/purchase** (buyer) then **mall creation** (seller).
5. **Delivery jobs** (seller post → courier offer → accept → POD) — largest, needs both seller + courier UI + auth.
6. **Referrals, redeemables, wallet withdrawals, AI tools** — value-added, can ship behind seller dashboard.

Each phase is independently shippable & testable; none requires the others.

---

## 4. What I'd need from you to proceed (decision, not code yet)

1. **Order:** Approve building **Phase 1 (seller foundation)** first? Or adjust the priority ordering?
2. **Auth:** Confirm sellers sign in with **email+password** (reuse stock) and/or **phone+password** (the `auth-`phone` module already exists) — determines the onboarding form.
3. **Scope today:** Build the seller store-management UI only (add product with size/quantity/price), and leave mall/courier/delivery for later phases? Or build multiple phases?
4. **Admin/ops baseline:** the `admin/*` routes (escrow holds, payoffs, go-live) — keep as backend-only or expect a Medusa Admin panel you'll use? (Admin UI is large.)
5. **Marketing copy vs. UI:** until seller/courier UI ships, should we soften the homepage claim so it doesn't over-promise? (independent of build).

---

## 5. Risk notes

- Frontend needs **two authenticated identities** (customer + seller) — the SDK/cookies and data helpers must be extended (not a one-line change).
- **Inventory/size**: product add/edit with size+quantity maps onto Medusa variants + inventory (inventory module) — the backend mobile-product route defaults to "One Size / no inventory"; a full size+stock UI needs the variants/inventory endpoints exercised by a real seller product form.
- All custom `sellers|store` routes are **email/bearer-scoped**: the frontend must send the seller token for each.
- These are functional, could-be-shipped phases — not UI polish; each is real code.

Please confirm **#1**, **#2**, and **#3** and I'll proceed (or outline card-by-card).