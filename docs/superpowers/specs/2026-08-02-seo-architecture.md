# How's u Frontend SEO Architecture (companion to UI/UX design)

> Technical companion to `2026-08-02-frontend-uiux-design.md` §8. Next.js 14/15 App Router. Every store, product, and seller page must be an indexed, ranking page. This doc is the implementation contract.

## 1. Route strategy

| Route | Rendering | Revalidation | Why |
|---|---|---|---|
| `/product/[handle]` | ISR | `revalidate: 120` + `revalidateTag` on price/stock/rating write | Fresh prices/stock, static-speed HTML for crawlers |
| `/store/[handle]` | ISR | `revalidate: 300` | Second ranking surface, lower churn |
| `/category/[...]` | ISR | `revalidate: 300` | Content churn only |
| `/malls/[id]` | ISR | `revalidate: 300` | Live counters via client fetch after SSR |
| Home / static | ISR | `revalidate: 3600` | — |
| Search / filters / results | SSR | `export const dynamic = "force-dynamic"` | Query-param driven; never staticize (duplicate-URL explosion) |
| Account / checkout / wallet | CSR+auth | no-store | Not indexable content |

**Rules:**
- `generateStaticParams` for the top-N product/store handles by traffic only; everything else renders on demand with ISR (bounded build, no 50k-page build).
- On-demand revalidation: `revalidateTag(\`product:${handle}\`)` fired from the mutation layer (order paid, price change, stock, rating) plus timer as safety net. Tags: `product:*`, `store:*`, `category:*`.
- Stock: serve ISR HTML; gate actual purchase client/API-side with a live inventory check. Crawlers see last-rendered availability, never blocked on inventory APIs.
- Price: short `revalidate` keeps SERP `Offer` within ~1-2 min of reality.

## 2. Metadata (every dynamic page)

`generateMetadata` for every dynamic route, wrapped in React `cache()` shared with the page so there is one fetch. Non-negotiable fields:

```
title:        "<Product> | <Store> | How's u"      (≤60 chars, brand right)
description:  unique, ≤155 chars, single intent, one concrete fact
alternates.canonical:  self-referencing absolute URL   (THE most common App Router bug — never omit)
alternates.languages:  full hreflang set incl. self + x-default
openGraph:    title, description, url, image (OG card 1200x630), siteName "How's u"
twitter:      card "summary_large_image"
robots:       index, follow
```

- `metadataBase` = production origin in root layout (relative OG images resolve).
- Root layout title template: `{ "%s | How's u" }`.
- `viewport` in the `viewport` export (Next 14+).
- JSON-LD does NOT go in `generateMetadata` — it is a `<script type="application/ld+json">` inside the page component (Server Component).

## 3. Structured data (JSON-LD per page type)

Emitted in the page component. Validate with Rich Results Test pre-merge.

- **Product page:** `Product` (+ `Offer`: priceCurrency/price/availability/itemCondition/priceValidUntil, `seller` as `IndividualSeller` pointing at the store URL, `shippingDetails`, `hasMerchantReturnPolicy`), `AggregateRating` + `Review[]` **only from real reviews rendered on the page**. Variants with differing prices → `AggregateOffer` (lowPrice/highPrice) or individual Offers. Required minimum: `name` + at least one of `offers`/`review`/`aggregateRating`.
- **Store page:** `Organization` (+ `@id` for the store), `makesOffer` refs, `sameAs` socials, `areaServed`. Use `OnlineStore`/`LocalBusiness` subtype if a physical address exists.
- **Category:** `ItemList` of `Product` + `BreadcrumbList`. Never a giant single `Product`. Never `AggregateRating` on category pages.
- **Home:** `WebSite` + `SearchAction` (sitelinks searchbox) with `query-input: required name=search_term_string`.
- **Breadcrumbs:** `BreadcrumbList` on product/store/category pages, position-ordered.

**Review markup hard rules (manual-action territory):**
- Only real, verifiable user reviews. No self-ratings, no `reviewCount: 0`, no placeholder authors.
- `aggregateRating`/`reviewCount` must exactly match what renders on the page.
- Marketplace reviews the *product listing*, never the platform.

## 4. Core Web Vitals (design constraint)

Targets (CrUX 75th pct): **LCP ≤ 2.0s, INP ≤ 150ms, CLS ≤ 0.05** (buffer under Google thresholds).

- **Exactly one `priority` image per page** (the LCP). All other images lazy. Always `width`+`height` or `fill`+`aspect-ratio` (kills CLS).
- `sizes` mandatory on every `next/image`; `formats: ["image/avif","image/webp"]`; `deviceSizes` matching real breakpoints.
- Fonts self-hosted via `next/font` (zero-layout-shift, `display: swap`). Never `@import` external fonts.
- No client-side fetching for SEO-critical content — product/store/category render fully in SSR/ISR HTML. Client components only for interactive islands (search, cart, review submission, filters that don't change canonical content).
- Streaming caveat (Next ≥15.2): if crawler head-fidelity is required, `experimental.htmlLimitedBots: "/.*/"`; verify with view-source in prod.

## 5. Crawlability & freshness

- **JS-disabled crawl test** in CI: title, meta, canonical, hreflang, JSON-LD, H1, copy all in raw HTML (`curl`/view-source).
- Sitemap (`app/sitemap.ts`): real `lastModified` from `updatedAt` (never `new Date()`), absolute prod URLs (never request host), no `noindex` URLs. Sitemap index beyond 50k URLs.
- `robots.ts`: allow `Googlebot` + AI *search* bots (OAI-SearchBot, PerplexityBot, ClaudeBot); decide deliberately on AI *training* bots (block `GPTBot`/`CCBot`/`Bytespider` via `X-Robots-Tag: noai, noimageai` + explicit entries if wanted — see security doc). Disallow: `/api/`, `/account/`, `/checkout/`, `/search?`, faceted params. Never block Googlebot from JS/CSS.
- **Pagination:** rel prev/next is deprecated/ignored — self-referencing canonical + clean `?page=` params + internal links. Keep paginated lists out of sitemaps.
- **Thin/duplicate content is the marketplace killer:** require unique seller-written descriptions (≥~300 words for index-worthy items), no template/regurgitated manufacturer blurbs, no mass AI-generated listings (site-wide Helpful Content risk).
- **Freshness:** real `updatedAt`, short ISR for price/stock, `304 Not Modified` via ETag so re-crawls are cheap. Cache: `public, s-maxage=120, stale-while-revalidate=3600` on ISR pages.

## 6. URL hygiene

- Product: `/product/<slug>` where slug = title-derived (lowercase, hyphens), optionally `-<shortId>` for uniqueness. Never ID-only.
- Store: `/store/<handle>` (branded, lowercase, hyphens). `/[countryCode]` prefix at segment root; each locale self-canonical + full hreflang set.
- Single source of truth module (`lib/seo.ts`) generating slug map + canonical + hreflang + sitemap so they cannot drift.

## 7. GEO (generative engine optimization) posture

AI Overviews/AI Mode cite pages with clean HTML + schema + descriptive titles + unique content. We serve the same signals: strong schema, crawlable SSR/ISR, E-E-A-T identifiers (seller since, verification, reviews), real images. This is free visibility in AI answers — same work as §1-6.

## 8. Ship checklist

1. View-source product/store/category in prod: title/meta/canonical/hreflang/JSON-LD/H1/copy all present.
2. Rich Results Test: Product/Offer/AggregateRating/BreadcrumbList pass; no warnings.
3. GSC: sitemap submitted, no noindex-in-sitemap, no blocked indexable templates.
4. Lighthouse mobile + CrUX: LCP ≤2s, INP ≤150ms, CLS ≤0.05; one priority image/page.
5. ISR verified: price change appears within revalidate + on-demand hook fires; no stale beyond max.
6. Every locale emits full hreflang + self canonical + matching `html lang`.
