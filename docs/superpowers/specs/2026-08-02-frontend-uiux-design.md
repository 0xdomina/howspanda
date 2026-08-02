# How's u Frontend UI/UX Design Specification (Phase 16)

> Single source of truth for the frontend build. Reads in this order: **Philosophy** -> **Tokens** -> **Voice & Copy** -> **Information Architecture** -> **Journeys** -> **Growth Engine UI** -> **Share System** -> **SEO** -> **Security** -> **Component Inventory** -> **Anti-Slop Rules**.
>
> Stack: Next.js App Router (14/15) + Tailwind, Medusa storefront conventions already scaffolded under `frontend/src`. Every page referenced below maps to a route that already exists in `frontend/src/app` or a backend route in `backend/src/api` that the UI must consume.

---

## 0. Product North Star (how this doc is judged)

How's u is a marketplace for **informal sellers, buyers, and couriers**. It is not another e-commerce. It is:

1. A **daily habit** (money identity: check balance, earn, sell, deliver) built like a social app, not a catalog.
2. A **trust engine** (escrow release, verified identity, ratings, POD) that makes strangers transact without fear.
3. A **self-reinforcing growth loop** (share any listing/store/job in one tap; every share can return a referral credit).

Every design decision below serves these three. **If a decision does not serve one of the three, it is decoration and it is cut.**

The single design philosophy carried through everything:

> **"Quiet premium chrome, loud real content."** The chrome (surfaces, type, spacing) reads like Stripe/Linear/Glossier — austere, engineered, trustworthy. The content (product photos, seller voices, live activity, rewards) carries all the energy — Depop/TikTok expressive. Growth mechanics are embedded but calm: never casino-chrome.

---

## 1. Design Philosophy & the Anti-Slop Canon

### 1.1 What "AI slop" is (and the 4-tell diagnostic)

AI slop is not one wrong choice; it is **4+ statistically-average choices on one screen** (distributional convergence of LLM templates). A screen is slop if it hits 4+ of:

1. Purple/indigo/blue gradient with no brand reason (hue 200-290).
2. Default font stack (Inter/Poppins/Geist) with nothing else authored.
3. Three identical feature cards each with a generic icon.
4. Centered hero + pill badge above H1 + "Welcome to [Platform]" copy.
5. Uniform radius + uniform soft shadow on every card (no hierarchy).
6. Emoji used as icons, especially sparkles.
7. Glassmorphism + gradient "glow blob" hero.
8. Generic aspirational copy ("Build the future", "Effortlessly", "Empowering sellers").
9. No `:hover`/`:active`/`:focus-visible`/`prefers-reduced-motion` states.
10. Stock people photography / 3D blob illustrations.

### 1.2 The fix: token-first, art-directed

Do not fix slop with adjectives. **Assign tokens before generation**:

- Cap the palette to **3 hues max** (dominant 60% / neutral 30% / accent 10%).
- Real display+body font pairing (never a single default).
- Separate elements by **whitespace first**, then a subtle surface tint, then elevation — a border only if all three fail. Never a flat gray card with a colored left border.
- Real product photography, real seller imagery, real campaign shots. No stock.
- Every interactive element ships **6 microstates** (default, hover, focus, active, disabled, loading).
- Every element earns its place (Section 7).

### 1.3 What "purposeful icon" means (the icon doctrine)

An icon is justified **only** when it is the affordance itself or speeds scanning:

- **Justified:** Share (universal affordance), Like/Heart, Cart, Search, Settings, Close, Back, Menu, Star rating, Verified check, Chat, Notification, Location, Camera (upload), Copy. These are recognized affordances with no equivalent text-only alternative at small size.
- **Not justified:** decorative icons next to a word button when the word is clear ("Settings" + gear inside a button is fine as the *affordance*; "Checkout" + a bag icon + "Checkout" text = redundant noise), icons that fill a bento card without teaching anything, brand/social logos used as decoration.

**Rules:**
- Text-first buttons for meaningful actions. Icon+text redundancy is banned (either the icon is the affordance and stands alone, or the text is enough).
- One icon set, one consistent stroke weight (1.5px), geometrically aligned to the type grid. No mixed icon libraries.
- Every icon = `aria-label` + focus state.
- **Zero emoji in the UI.** Emoji appears only in user-generated content (product descriptions, chat) and never as interface chrome.

---

## 2. Design Tokens (locked)

### 2.1 Typography

> The 2026 signal: default "Inter fatigue". We author a real pairing. **Display serif for editorial reward moments + soft humanist grotesk for UI.**

| Role | Face | Usage |
|---|---|---|
| **Display** | **Fraunces** (variable, soft, optical sizing) | Hero, reward/editorial moments, price announcements, seller "brand moment" headers. *Reserved, never overused.* |
| **UI / Body** | **Instrument Sans** (variable) or **Plus Jakarta Sans** | All interface text, buttons, nav, forms. Humanist-softened, NOT Inter/Geist/Poppins. |
| **Mono accent** | **JetBrains Mono** | Prices in confirm/escrow/payout surfaces, codes, order IDs, timers, tracking numbers. Tabular numerals: the "money is precise" signal. |

- **Numeric rules:** tabular figures (`font-variant-numeric: tabular-nums`) on ALL money, counts, timers. Currency symbol is naira-aware (`₦`) via `Intl.NumberFormat`.
- **Scale (modular 1.25):** `text-xs 12 / sm 14 / base 16 / lg 18 / xl 20 / 2xl 24 / 3xl 30 / 4xl 36 / 5xl 48 / 6xl 60 / 7xl 72`. Body min 16px. `line-height`: display 0.95-1.05, headings 1.15, body 1.5-1.6. Measure ≤ 70 chars.
- **Tracking (negative at size):** display ≥ 36px: `-0.02em` to `-0.04em` scaled; body `0`. This is the biggest "art-directed, not generated" tell.
- **Eyebrows:** 12-13px, uppercase, `+0.04em` tracking for section labels (magazine masthead cadence).
- Self-host via `next/font` (zero CLS, `display: swap`, no external requests).
- Hierarchy = **weight + tone**, never color alone. Max 4-6 sizes on any screen.

### 2.2 Color (light-mode-first, warm)

> Warm neutrals read premium/editorial (Glossier/Pinterest). No pure `#000`/`#fff`. One saturated accent reserved for money-motion and primary CTA.

```
canvas:     #FBFBF8   (warm paper)
surface:    #FFFFFF
surface-2:  #F4F2EC   (tinted card / section alt)
text:       #211F1A   (warm near-black "Ink")
text-muted: #6B675F   (warm trust gray)
hairline:   #E7E4DC   (borders)
accent:     #E35D2A   (burnt tangerine — the ONE chromatic identity; CTA, active nav, verified, live-dots, wallet "money in" moments)
accent-inverse: #FFFFFF (text on accent)
success:    #2E7D4F   (desaturated green — money released, paid, delivered, verified)
danger:     #C43D2E   (clear red — errors, disputes, blocked)
warning:    #B7791F   (amber — pending, caution)
info:       #2B6CB0   (link/help)
```

- **The accent rule:** accent is scarce. It appears on: primary CTA, active nav state, verified badge, "money moved in" moments, focus rings, live indicators. Never fills cards. Never on backgrounds at scale. When in doubt, use text/tone not accent.
- **Dark band (optional, for the "sunset moment" and reward surfaces):** `#0E0D0B` panels, hairline `#2A2825`, text `#F2EFE9`. Used sparingly: share-card, streak hero, reward reveal, store hero on dark imagery. **Light remains the default** for commerce/trust/browsing.
- **Accessibility:** body ≥ 4.5:1 (all neutrals pass), large text ≥ 3:1, UI components ≥ 3:1. Never color-alone for meaning (pair with text/icon). Target WCAG 2.2 AA; structure for APCA.

### 2.3 Spacing, Radius, Elevation

```
spacing: 0 4 8 12 16 24 32 48 64 96 128   (8pt base, 4pt inside components)
container: 1120px max, 24px page gutters (mobile 16px)
feed gutters: 24px  |  card padding 16px  |  hero 24-48px
radius: card 16px  |  control 10px  |  modal 24px  |  pill (9999) ONLY for primary CTA, tags, filter chips, badges, avatars
elevation: hairline borders + surface tint first; soft tinted shadow only for floaters/modals; never the default soft-shadow-everywhere
density: social feed is AIRY (Depop/Pinterest breath); seller-edit/checkout surfaces are DENSER (trust + efficiency)
```

### 2.4 Motion

```
instant: 50ms   fast: 150ms   moderate: 300ms   slow: 500ms   deliberate: 800ms
standard: cubic-bezier(0.4, 0, 0.2, 1)      enter: cubic-bezier(0, 0, 0.2, 1)
exit:    cubic-bezier(0.4, 0, 1, 1)  (~60% of entrance duration)   spring: cubic-bezier(0.34, 1.56, 0.64, 1)
```

- **Semantic motion:** spring for positive (like, payout landed, redeem success); standard for state changes; instant for system states; exit faster than enter (feels decisive).
- Rule of intent: every motion communicates state, leads attention, or encodes personality. Remove pure decoration.
- Micro: `:active` scale(0.97) on pressable; heart double-tap micro-spring; skeleton screens match final layout (never spinners); **`prefers-reduced-motion` collapses durations to ~0** (functional, not removed).

### 2.5 Icon set

One geometric line set, **1.5px stroke**, rounded caps aligned to type grid. See allowed set in §7.

---

## 3. Voice & Copy (the writing system)

> Ruthlessly simple. **No AI slop words. No double dash, no double hyphen anywhere in user-facing copy.** Every label earns its pixels.

**Banned words/phrases (copy lint):** "effortlessly", "welcome to", "build the future", "empowering", "seamlessly", "your one-stop", "unlock", "supercharge", "revolutionize", "discover" (as filler), "get started today", generic "explore", "seamless". Also banned: emoji in UI, all-caps shouting, exclamation marks outside reward/celebration moments.

**Voice principles:**
1. **Name the real thing.** "Your money is held until you confirm delivery" — not "Our secure escrow solution provides peace of mind."
2. **One idea per line.** Buttons say the verb: `Sell`, `Buy now`, `Make an offer`, `Post delivery job`, `Copy link`, `Confirm received`.
3. **Money is always precise, never vague.** Show exact amounts, fees, hold windows. "Fee ₦150 (3%)" beats "low fees".
4. **No double-dash / hyphen spacing issues.** En-dashes/em-dashes banned in copy; hyphens allowed only inside compound words and URL slugs. Sweep copy with `/\s-[-–—]/` before shipping.
5. **Human warmth, professional restraint.** Numbers and facts carry the tone. "Adaeze delivered your order" — real names, real verbs.
6. **Empty states are tutorials.** "No orders yet. Post your first delivery job in 30 seconds." Never "No items found."

---

## 4. Information Architecture & Navigation (platform-wide)

### 4.1 Shells

Three distinct shells, one design language:

| Shell | Audience | Character |
|---|---|---|
| **Public / Storefront** (home, browse, product, store, mall) | Everyone, SEO-heavy | Image-first, airy, social-feed energy. Share everywhere. |
| **App / Account** (wallet, orders, profile) | Logged-in users | Denser, precise, money-grade. Balance always visible. |
| **Seller Console** | Sellers | Efficiency-first tool. AI surfaces. Tabular, dense. |
| **Courier / Job flow** | Couriers + buyers posting jobs | Task-first. One clear action per screen. |

### 4.2 Primary navigation (mobile-first, bottom tab bar)

The app is a phone app at heart. Mobile = **5-tab bottom bar** (fixed, safe-area aware):

1. **Home** — the feed (discover, malls, trending).
2. **Search** — search + categories + filter chips.
3. **Sell** — center CTA tab, raised accent pill ("+"). Opens listing flow.
4. **Orders / Activity** — orders, delivery jobs, chat inbox, notifications badge.
5. **Wallet / Account** — balance at top, then profile. *(Money identity lives here; balance is the daily-heartbeat hook.)*

**Desktop:** same five destinations in a slim top nav (logo left, search center, wallet/balance right), breadcrumbs under. Bottom bar collapses to top nav.

### 4.3 Global rules

- **Balance is always one tap away** and visible on the Wallet tab header. This is the daily habit anchor.
- **Cart lives in a slide-over** from any product/store (Medusa cart conventions already present: `/cart`, `modules/cart`).
- **Share is available on every screen that contains a shareable entity** (product, store, mall, listing, job, order-confirmed, reward earned). One consistent Share control, top-right.
- **Chat (3-way DM)** accessible from order/job detail and inbox. The human layer.
- **Back always returns to the exact previous context** (not the tab root).

---

## 5. User Journeys (mapped to real routes)

### 5.1 Buyer: first purchase in under 2 minutes (activation)

Trigger: link, share, search, or store visit.

1. **Home feed** (`/` home) — image-first rail. `Touch` a product card.
2. **Product page** (`[countryCode]/products/[handle]`) — one primary image (priority, aspect-ratio), price + "Buy now" pill (single accent CTA), seller row (avatar, verified check, rating, response rate) linking to `/store/sellers/[handle]`. Reviews visible immediately (server-rendered). Share top-right.
3. **Buy now** -> **Cart slide-over** (already `modules/cart`) -> **Checkout** (`[countryCode]/(checkout)/checkout`) — collapsed steps: address, delivery method, payment, review. Clean money math only (price, delivery fee, total). No mechanics explainers.
4. **Pay** -> order confirmed (`order/[id]/confirmed`) — celebration moment (spring), order number in mono, share card offered ("Tell a friend").
5. **Track + chat** — status timeline from order detail; courier assignment appears; POD (photo/QR) verification flow. **Refund affordance:** when the order is still open, a quiet `Request refund` action is available (muted, low-emphasis link) — it opens a short reason screen, one tap to submit. No conditions text before the action; the action simply exists.
6. **Confirm receipt** (`store/orders/[id]/confirm-receipt`) — big success, "+₦X to your wallet" if applicable. The confirm action is the one that closes the refund window; it is stated as an action consequence only when it matters (see §5.6).
7. **Review + tip** (`store/orders/[id]/review`, `[id]/tip`) — one screen, stars + optional message + optional tip. **The review IS the content engine** — treated as UGC, shareable.

**Retention hooks wired in:** after first order, show the streak/balance entry points. After delivery confirmation, the wallet balance visibly moves — the loop's reward pulse.

### 5.2 Seller: list in 60 seconds, run the business daily

1. **Sell tab** (`+`) -> **Listing flow** (`sellers/products`, `sellers/me` for profile). Mobile-first: photo first (camera = first field), then price, then description. Draft auto-saves. AI assist surfaced as a quiet button ("Improve description" -> `sellers/ai/listing`), never auto-injected without review.
2. **Manage** — seller dashboard (`modules/account/@dashboard`-style): orders in/out (`sellers/orders`), deliver/return actions (`mark-delivered`, `return-received`), inventory, ratings, redeemed vouchers (`sellers/redeemables`).
3. **Money** — balance (`sellers/balance`), commissions (`sellers/commissions`), payout account + withdrawals (`sellers/payout-accounts`, `sellers/payouts`). Tabular numerals everywhere. Every payout has a status timeline.
4. **Intelligence** (`sellers/ai/brief`, `/recommendations`, `/insights`) — the daily brief is the "morning report" moment: served as a top card in the seller console with the day's numbers and 2-3 grounded recommendations. Calm, not flashy.
5. **Growth** — `sellers/referrals` (their referral link + share card), tips received, rewards/streaks visible.

### 5.3 Courier / Delivery: a gig you grab in one tap

1. **Job feed** — `store/delivery-jobs` as a live rail: "₦1,500 · 3km · pickup in Apo" with distance. Tap to view (`[id]`).
2. **Offer / accept** — one screen: earn amount (mono, big), pickup/dropoff, time, "Make an offer" or "Accept". Negotiation via `offers` + `offers/[offerId]/accept`.
3. **On the job** — timeline, in-app chat (`[id]/chat`), pickup verification (`verify/pickup` QR), dropoff verification (`verify/delivery` POD photo).
4. **Earned** — payout lands (escrow release on POD), balance pulses, streak increments. Share your "I earned ₦X this week" moment (status + growth).
5. **Identity** — KYC ladder (`kyc/request`, `kyc/verify`, `kyc/identity`) gating access to courier jobs: calm, step-by-step, one field per screen. Badge shown once verified.

### 5.4 Mall buyer (community shopping)

`store/malls/active` rail on Home. Mall page (`malls/[id]`) = live storefront with multiple sellers + joined community (`join-buyer`). Purchase via `malls/[id]/purchase`. Design: energetic but trusted — live counters ("12 people in this mall now") are genuine, not fake urgency.

---

## 6. Growth Engine UI (the psychology layer)

> Mechanisms from behavioral research (Hook model, Fogg B=MAP, growth loops), rendered **calm and transparent** — the Depop-not-Temu lesson: growth mechanics that convert, chrome that does not read as manipulative.

### 6.1 The daily habit kernel

- **Wallet as heartbeat:** balance + a one-line "since yesterday" delta on the Wallet tab. Check-in is a 1-second action (Fogg: shrink until it clears the action line).
- **Streak, engineered for forgiveness:** a visible streak on activity ("7-day earning streak") with a free "streak save" mechanism — protect, never punish. Loss-aversion is the retention engine.
- **Daily offer/job pulse:** the Home feed is the variable-reward surface (real value variance, never fake). One live element per screen max.

### 6.2 Referral: the activation-correct loop (Cash App lesson)

- Referral pays **only on a real-money-plus action by both sides** (first completed order, first delivery, first funded payout), not on signup. UI states this plainly: *"You get ₦500 when your friend completes their first delivery."*
- **Referral center** (`store/referrals`, `sellers/referrals`): one screen, your code in mono, "Copy" button, share card, live progress ("2 of 3 friends activated"). Progress bars are real.
- Every shareable entity carries an attributed link (`?ref=<id>`) — see §7.

### 6.3 Status, earned honestly

- **Verified** (accent check) after KYC — shown next to name, never purchasable.
- **Leaderboards are local and real:** "Top couriers this week in your area" — computed from genuine delivery data, never fabricated.
- **Milestone celebrations:** reward-earned moments use the display serif + spring motion + optional share card ("I earned a ₦1,000 reward"). Status no one sees is no status.
- Rules: badges map to *delivered* reality; never a fake score; no countdown timers that lie; urgency is only ever factual (escrow hold window, actual low stock).

### 5.6 Refund: action-first, zero mechanics talk (LANGUAGE RULE)

> User-facing copy never explains money mechanics. No "held in escrow", no "we hold your funds until", no statement about where money stays or how it is stored. Buyers see **capability and consequence**, not mechanism.

What users see instead:
- **The capability:** a quiet `Request refund` action on the order page, present whenever the refund window is genuinely open. It is an action, not an explanation. Tapping it opens a one-screen reason picker (`request-return`) with a single confirm. The backend decides the window; the UI never states the rule up front.
- **The consequence, only when it matters:** when a user confirms receipt, the single line that closes the opportunity — *"Refunds are no longer available after you confirm."* — appears **on the confirm action itself** (confirm + cancel on the same screen). This is consequence-at-the-decision-point, not a standing explainer.
- **Fulfilled outcomes, shown plainly:** on success screens (refund issued, delivered, released), the factual result in money terms: "₦X refunded to your wallet" or "You've been refunded ₦X." Results, not process.

**Banned phrasing (copy lint):** escrow, held, held in, your funds are kept, we protect your payment, guaranteed refund (unless the policy truly is unconditional), any sentence explaining where money sits. Allowed: `Refund`, `Request refund`, `Refunded ₦X`, `Refunds not available after you confirm`, `You've been refunded`.

This rule applies to the whole product surface: seller, courier, and payout flows present payouts as statuses and actions (`Withdraw`, `Paid`, `Pending`, `Released`), never as money-mechanics narratives.

### 6.4 Trust = the habit prerequisite

- The refund capability is **always present as an action, never as an explainer** — `Request refund` on the order page when the window is open, consequence line only at the confirm decision point (§5.6). 
- Identity is progressive and calm: one field per KYC step.
- Every seller/courier row shows real signals: verified, response rate, "since 2025", ratings count. E-E-A-T in the UI.
- **Never fudge activity numbers.** Fake "2k+ sold" is the trust-killer (§1.1 slop + Temu lesson).

---

## 7. The Share System (one tap to every network + copy)

> TikTok-grade seamlessness, attribution built in. Single `ShareSheet` component. **The share moment is the product's virality engine, so it is first-class everywhere.**

### 7.1 Behavior

```
User taps Share (any shareable entity)
  1. If navigator.share available (mobile Safari/Chrome/Android) -> NATIVE SHARE SHEET opens
     (lists every installed app incl. WhatsApp, IG, TikTok). User cancelled? stop. Done.
  2. Else -> SHARE BOTTOM-SHEET overlay:
        [Copy link]  pinned first, always present  (universal fallback, works everywhere)
        [WhatsApp] [X] [Facebook] [Telegram] [LinkedIn] [SMS] [Email] [Pinterest]  (brand row)
        [Download share-card]  (generated media card, below)
        [Native share / More] if webShare exists but was declined
  3. Beacon fired (navigator.sendBeacon) BEFORE opening target: {entity, channel, ref}.
```

### 7.2 Intent URLs (verified working formats)

| Network | URL |
|---|---|
| WhatsApp | `https://api.whatsapp.com/send?text=<T+url>` |
| X | `https://twitter.com/intent/tweet?text=<T>&hashtags=<tags>&via=<handle>&url=<U>` |
| Facebook | `https://www.facebook.com/sharer/sharer.php?u=<U>` (text prefill removed by FB) |
| LinkedIn | `https://www.linkedin.com/sharing/share-offsite/?url=<U>` |
| Telegram | `https://t.me/share/url?url=<U>&text=<T>` |
| Pinterest | `https://www.pinterest.com/pin/create/button/?url=<U>&media=<IMG>&description=<T>` |
| SMS | `sms:?&body=<T+U>` |
| Email | `mailto:?subject=<S>&body=<T+U>` |

- **TikTok/Instagram have no web intent** — native sheet or Copy-link covers them. The share-card makes the copy worth pasting.
- **Clipboard:** `navigator.clipboard.writeText` with a hidden-textarea `execCommand('copy')` fallback for in-app browsers (FB/IG WebViews silently drop clipboard). Always show the "Copied" toast — failures are silent.
- All links open `target="_blank" rel="noopener noreferrer"`.

### 7.3 The shareable card (media + OG)

- Every product/store/listing/reward gets a **generated OG/share image** (Next `ImageResponse`, 1200x630): real product photo + display-serif headline + price in mono + verified/rating + a QR encoding the attributed link + handle. This is what makes the pasted link a rich card on WhatsApp/IG.
- Page-level `generateMetadata` sets `openGraph` + `twitter` (`summary_large_image`) so unfurls are perfect (see SEO §8).
- **Share copy templates** (per entity, short, no fluff):
  - Product: `"<Title> · ₦X on How's u"` 
  - Store: `"<Store name> on How's u — <n> items live"`
  - Reward/streak: `"I've earned a ₦X reward on How's u"`

### 7.4 Attribution

- Share links built server-side with `?ref=<shareId>`; the landing page records click→referral (`store/referrals` already wired backend-side). Share events tracked via beacon. This is the growth loop's data spine.

---

## 8. SEO Engineering (rank every store, product, seller)

> Full report in companion doc `2026-08-02-seo-architecture.md` (technical). Here: the product decisions the UI enforces.

1. **Every entity is its own indexed page:** product `/product/[handle]`, store `/store/[handle]`, seller reviews, malls, categories, with real, unique content. Handles are SEO slugs (title-derived), never ID-only.
2. **Server-rendered content for SEO-critical pages.** The image-first feed may be client-enhanced, but product/store/category pages render title, description, price, reviews, JSON-LD in the initial HTML (ISR `revalidate` 60-300s + `revalidateTag` on write).
3. **Unique product copy is a ranking asset.** The seller's own description (condition, provenance, measurements) is the thin-content defense and the E-E-A-T signal. UI encourages real descriptions, shows them prominently.
4. **Structured data** (JSON-LD `Product`/`Offer`/`AggregateRating`/`BreadcrumbList`/`Organization`) emitted from the page component for product, store, category. Only real reviews feed `aggregateRating`.
5. **Core Web Vitals are a design constraint:** one `priority` LCP image per page with `width`/`height` + `sizes` (kills CLS), lazy everything below fold, self-hosted fonts, no client-side fetching for indexable content.
6. **`sitemap.ts` + `robots.ts`** per §1.2 of the companion doc; `lastModified` real; AI *training* crawlers blocked, AI *search* bots + Googlebot allowed (GEO/AI-answer visibility).
7. **E-E-A-T in the UI:** seller "since" dates, verification, response rate, physical store signals, returns policy visible. Trustworthiness as a layout element, not a footer.

---

## 9. Security (frontend posture + the upload contract)

> Backend hardening is Phase 15 scope (rate limits, secrets, admin auth). This section is what the **frontend** must enforce and display. Companion technical report: `2026-08-02-security-architecture.md`.

1. **Upload pipeline (frontend contract):** client never sends raw files directly to a public path. Flow: `POST /uploads/sign` (auth, quota, intent) -> presigned PUT to private `staging/` -> `POST /uploads/finalize` -> isolated worker re-encodes to WebP/AVIF (strips metadata, clamps dimensions, kills polyglots) -> promote to CDN. Client previews a local URL, uploads with progress, never displays raw bytes.
2. **CSP + security headers** (config, see companion doc): `default-src 'self'`, nonce-based `script-src` with `strict-dynamic`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, HSTS, COOP/COEP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation/camera/mic off by default). Report-only rollout first.
3. **`next/image` `remotePatterns` allowlist** — only our CDN hostname; never arbitrary third-party hosts (SSRF/pixel-bomb defense). Pin Next ≥15.5.10 (CVE-2025-59471 image-OOM).
4. **No `dangerouslySetInnerHTML`** except server-assembled JSON-LD; user/rich text stored as structured blocks (never raw HTML strings), rendered with a safe renderer, sanitized at output time with pinned DOMPurify ≥3.3.4.
5. **SVG is rejected for user image fields** (or sanitized/rasterized server-side only — never served raw). PDFs served attachment-only from CDN with sandbox CSP.
6. **Chain of trust:** SRI on third-party scripts, pinned versions, `npm audit` in CI, no `eval`, no dynamic imports of user strings.
7. **Anti-clone posture (honest):** value = network + escrow/trust + proprietary activity data, not pixels. Keep ranking/algorithm logic server-side (never shipped in bundles). Selective `robots.txt`, honeypot decoy routes, Turnstile on auth/checkout/referral forms, behavioral bot detection at the edge. AI-training crawlers excluded; search crawlers included.
8. **UI security micro-behaviors:** money pages never cache (no-store), session cookie `HttpOnly; Secure; SameSite=Lax`, logout everywhere, every destructive action confirmable, sensitive copy never in URL params.

---

## 10. Component Inventory (build order)

> Ordered by dependency. Each is a small, typed, tokenized unit. No component is built until its token use is unambiguous.

**Foundations**
1. Tokens → Tailwind config (`colors`, `fontFamily`, `fontSize`, `radius`, `spacing`, `boxShadow`, `easing`).
2. `Button` (6 microstates, sizes, variants: primary/surface/ghost/danger, with/without icon per doctrine).
3. `Input`/`Field` (+ label, error, success, required, char-count, prefix/suffix for ₦).
4. `Skeleton` set (layout-matching, shimmer-off under reduced-motion).
5. Icon set (single stroke weight) + `IconButton` (affordance-only).

**Atoms**
6. `Badge` (verified, pending, delivered, paid) + `Chip` (filters, tags).
7. `RatingStars` (tabular count) + `Avatar` (+ verified check overlay).
8. `Toast`/`Snackbar` (spring on success, standard on error) + `Modal`/`BottomSheet`.
9. `Tabs` + `Breadcrumbs` + `Stepper` (checkout/KYC one-step screens).
10. `EmptyState` (tutorial voice) + `ErrorState` (recovery action).
11. `MoneyText` (mono, tabular, ₦ via Intl) + `CountdownTimer` (factual only).

**Entities**
12. `ProductCard` (image-first, price mono, seller row, share) + `ProductGallery` (swipe/side-by-side, priority LCP).
13. `SellerCard` / `StoreHeader` (brand moment: serif store name, verified, since, response rate).
14. `OrderCard` + `OrderTimeline` + `DeliveryJobCard` (earn amount mono, distance, time) + `JobDetail`.
15. `ReviewCard` (UGC, shareable) + `ReviewComposer` (stars + message + optional tip).
16. `WalletHeader` (balance + delta) + `LedgerRow` (mono) + `PayoutCard` (status timeline).
17. `RefundAction` (quiet `Request refund` affordance on order detail, reason screen, opens only when the window is open) + `ConfirmAction` (the one action that closes the refund window, consequence line on it).

**Systems**
18. `ShareSheet` (§7) + `ShareCardGenerator` (ImageResponse OG route) + `Attribution` (ref links + beacon).
19. `CartSlideOver` (adopt existing `modules/cart`) + `CheckoutForm` (collapsed steps + clean money math + payment).
20. `BottomTabBar` (mobile 5-tab) / `TopNav` (desktop) + `SideMenu`.
21. `ReferralCenter` (§6.2) + `StreakCard` (§6.1) + `RewardReveal` (serif celebration).
22. `AIInsightCard` (seller console: brief + recommendations, calm presentation, "why" text always).
23. `KYCStep` (one field per step, progress, verified state).
24. `LiveMallCard` (real activity numbers only) + `MallStorefront`.

**Admin** (uses Medusa admin conventions; apply same token system, dense variant).

---

## 11. Anti-Slop / Design-Quality Checklist (pre-merge for every screen)

- [ ] ≤3 hues visible; accent used only for CTA/active/verified/money-in/focus.
- [ ] Display serif used sparingly; body is Instrument Sans; all money is mono tabular.
- [ ] No emoji, no banned words, no double-dash/hyphen strings. Copy lint passed.
- [ ] Elements separated by whitespace→tint→elevation; no flat-card-with-color-bar.
- [ ] Every interactive element has 6 states + `:focus-visible` + `prefers-reduced-motion`.
- [ ] Icons: only the affordance set, one stroke weight, `aria-label`, no icon+text redundancy.
- [ ] LCP image has `priority`, `width`/`height`, `sizes`; fonts self-hosted; no CLS.
- [ ] SEO-critical content + JSON-LD in initial HTML; canonical + hreflang correct.
- [ ] No money-mechanics copy anywhere; refunds are actions (`Request refund`, `Refunded ₦X`), consequence only at the confirm decision point; no fabricated urgency.
- [ ] Share control present on every shareable entity; ref attribution on all outbound links.
- [ ] Security: no raw user HTML, allowlisted image hosts, money pages no-store.

---

## 12. Build Sequence (step by step)

1. **Foundations** — tokens → Tailwind theme → Button/Input/Field/Skeleton/Icon set.
2. **Shell** — BottomTabBar/TopNav, SideMenu, container/grid, money text, toast/modal.
3. **Home feed + Search** — ProductCard, rails, category chips, refinement list (adapt existing `modules/store`).
4. **Product page** — gallery, buy rail, seller row, reviews, ShareSheet.
5. **Cart + Checkout** — adapt existing `modules/cart` + `modules/checkout`, add clean money math + payment buttons.
6. **Order confirmed + Track** — celebration, timeline, POD, confirm-receipt (with refund-consequence line on the confirm action), refund affordance, review/tip.
7. **Wallet + Account** — balance, ledger, payouts, KYC ladder, profile.
8. **Seller console** — listing flow, manage, money, AI cards, referrals.
9. **Courier flow** — job feed, offer/accept, on-job timeline, verify, earned.
10. **Share system + OG cards** — ShareSheet everywhere, ImageResponse generators, attribution beacon.
11. **Growth layer** — streak, referral center, reward reveal, local leaderboards.
12. **Malls** — live mall storefront + purchase.
13. **SEO pass** — generateMetadata per route, JSON-LD, sitemap, robots, CWV audit.
14. **Security pass** — headers, CSP report-only, upload contract, next/image allowlist, lint sweep.
15. **Polish** — motion audit, empty states, a11y pass, cross-device QA.

---

## 13. Definition of Done for the frontend

- All 24 component groups exist, tokenized, typed; zero placeholder slop.
- Buyer first-order path (home→buy→checkout→confirm) works mobile-first in <2 min.
- Seller listing path works in <60s; wallet/payouts correct with real balances.
- Courier accept→POD→earned works end to end.
- ShareSheet + attributed links live on every shareable entity; beacon firing.
- SEO pages pass JS-disabled crawl + Rich Results; CWV green (LCP ≤2s, INP ≤150ms, CLS ≤0.05).
- Security headers enforced; upload pipeline never serves raw user bytes; CSP report-only clean.
- Copy lint clean; no emoji/double-dash/slop-words; every screen passes §11 checklist.
