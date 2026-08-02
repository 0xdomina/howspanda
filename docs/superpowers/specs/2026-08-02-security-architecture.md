# How's u Frontend Security & Anti-Clone Architecture (companion to UI/UX design)

> Technical companion to `2026-08-02-frontend-uiux-design.md` §9. Covers the frontend attack surface, the safe upload pipeline, and the honest anti-clone strategy. Backend hardening (rate limits, admin auth, fail-fast secrets) is Phase 15 scope in the backend repo — this doc is what the frontend enforces.

## 1. Threat model (frontend-relevant)

1. Malicious file/image upload → stored XSS / server-side SSRF / DoS via processing.
2. Scraping, botting, and bulk copy by AI-training crawlers and competitors.
3. Supply-chain: tampered third-party assets, known-CVE dependencies.
4. Client-side injection: raw HTML, `dangerouslySetInnerHTML`, prototype pollution, DOM clobbering.
5. Attacker-controlled image sources fed to `next/image` (SSRF/pixel-bomb).

## 2. Upload pipeline (the contract)

**Client must never send raw files to a public path, and the server must never serve user bytes directly.**

```
Browser ─POST /uploads/sign (auth + quota + intent)─►  returns short-TTL presigned PUT (60s)
Browser ─PUT─► private staging/ bucket
Browser ─POST /uploads/finalize {key, etag}─► server HEAD-checks size + content-type (idempotent)
isolated worker (egress-denied) ─► size/dimension caps → magic-byte sniff → re-encode
     sharp(buf,{limitInputPixels}).rotate().resize(4000x4000,{fit:'inside',withoutEnlargement:true}).webp({quality:82})
     (strips EXIF/IPTC/XMP/ICC + thumbnail; kills polyglot tails) → promote to public CDN
```

**Hard rules:**
- Never trust original bytes; `staging/` is untrusted quarantine. Only the **derived** object is served, under a **server-generated key** (never the client filename).
- **SVG: rejected** for user image fields (recommended default); if ever accepted, sanitize server-side or rasterize→PNG — never stored/served raw.
- **PDFs:** attachment-only responses with `Content-Security-Policy: default-src 'none'; sandbox`, separate origin.
- **No arbitrary remote URLs** as image sources from the client (SSRF). `next/image` `remotePatterns` = allowlist only our CDN hostname.
- ClamAV scan for non-image/risky types; quota + rate limit on `/uploads/*`; orphan `staging/` TTL cleanup.

## 3. Security headers (next.config headers + CDN)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self';
  script-src 'self' 'nonce-<per-request>' 'strict-dynamic';      # NO 'unsafe-inline', NO 'unsafe-eval'
  style-src 'self' 'nonce-<per-request>';
  img-src 'self' data: https://cdn.howsu.com;
  font-src 'self' https: data:;
  connect-src 'self' https://api.howsu.com;
  frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self';
  upgrade-insecure-requests
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp        # only after third-party resource audit
Cross-Origin-Resource-Policy: same-site
Origin-Agent-Cluster: ?1
Cache-Control: no-store                             # on HTML/auth pages (nonces must not be cached)
```

**Rollout:** ship `Content-Security-Policy-Report-Only` + `Reporting-Endpoints` for ~2 weeks, fix violations, then enforce. Helmet on the Express/Medusa backend mirrors the same directives (nonce-based, `strict-dynamic`).

## 4. Client-side integrity

- **SRI** on any third-party script/style; prefer pinned first-party bundles + nonce CSP.
- `next/image` allowlist only (CVE-2025-59471 image-OOM: pin **Next ≥15.5.10 / 16.1.5**; CVE-2025-55173: ≥15.4.5/14.2.31).
- **`dangerouslySetInnerHTML` banned** except server-assembled JSON-LD. User/rich text stored as structured blocks (Markdown), rendered with a safe renderer; sanitize at **output** time with pinned **DOMPurify ≥3.3.4** (GHSA-v9jr-rg53-9pgp) if raw HTML ever enters.
- **DOM clobbering:** DOMPurify `SANITIZE_DOM: true` + `SANITIZE_NAMED_PROPS: true`; no `window.X` init patterns; module-scoped constants; freeze config objects.
- **Prototype pollution:** avoid deep-merge of untrusted objects (`Object.create(null)`), pin known-PP libraries, CI taint/DOM-sink scanning.
- **Supply chain:** `npm audit --omit=dev` + `npm audit signatures` gating deploys, exact pins, committed lockfile, `overrides` for transitive CVEs, allowlist for sharp/libvips (≥0.34.1/8.16.1).
- Money/auth pages: `no-store`, session cookie `HttpOnly; Secure; SameSite=Lax`, logout everywhere, sensitive data never in URL params, destructive actions confirmable.

## 5. Anti-scraping & anti-clone (honest strategy)

**Truth:** you cannot prevent someone copying the pixels or reimplementing the UI. Value is defended, not pixels. The moats: **network effects, escrow/trust reputation, proprietary transaction + review data** (behind auth, never in public HTML), legal/TM posture, operational speed.

Layers (in order of increasing sophistication):
1. **Policy:** `robots.txt` — allow Googlebot + AI *search* bots (OAI-SearchBot, PerplexityBot, ClaudeBot); block AI *training* bots (GPTBot, ClaudeBot-as-trainer, CCBot, Bytespider) with `Disallow` + `X-Robots-Tag: noai, noimageai` on sensitive pages. Keep sitemap pointed at Googlebot.
2. **Edge/CDN:** Cloudflare Bot Fight Mode / Super Bot Fight Mode; verified-bot allowlists (Googlebot/Bingbot by reverse-DNS + IP); block datacenter/proxy ASNs on content routes.
3. **Fingerprinting:** TLS fingerprint (JA3/JA4), HTTP/2 SETTINGS order, header casing, `Sec-Fetch-*`, `Sec-CH-UA` consistency; mismatch with claimed UA → challenge.
4. **In-browser:** Cloudflare Turnstile (non-interactive) on auth, checkout, referral, contact forms; validate server-side.
5. **Behavioral:** per-IP/UA/ASN velocity + session depth limits, sequence-pattern detection (paginated harvests), scroll/click cadence.
6. **Honeypots:** invisible links/hidden form fields as bots-only decoys → block the fingerprint; consider decoy page networks (AI Labyrinth pattern).
7. **Business-logic secrecy:** ranking/scoring/recommendation algorithms live **server-side only** — never shipped in JS bundles; expose only sanitized API responses.
8. **Anti-AI-copy of text:** unique seller-authored descriptions, real data points, dynamic ISR freshness (copied snapshots go stale fast), per-session watermark/canary tokens in scraped corpora for traceability.

**Balance rule (SEO doc §6):** anti-scraping is an application-layer problem; robots/sitemap is traffic control. Never block Googlebot by UA-only (≈75% of "Googlebot" claims are spoofed — verify by reverse-DNS/IP before throttling). Rate-limit the expensive endpoints search/filters/price/checkout — the surfaces scrapers hammer and SEO doesn't need.

## 6. Ship checklist

1. CSP enforced (nonce + strict-dynamic), report-only clean; all headers present (§3).
2. Upload pipeline live: no raw user bytes served, re-encode + strip + clamp + quarantine→promote, SVG rejected.
3. `next/image` remotePatterns = CDN allowlist only; Next pinned ≥15.5.10.
4. DOMPurify ≥3.3.4 pinned; no `dangerouslySetInnerHTML` outside JSON-LD; structured-block rich text.
5. Turnstile on auth/checkout/referral; behavioral bot detection at edge; honeypots deployed.
6. `npm audit` gate green; no `eval`; ranking logic server-side only.
7. robots.txt: Googlebot + AI-search allowed, AI-training blocked; sitemap intact.
