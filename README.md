# Apeiron — Headless Shopify Storefront

A headless Shopify storefront for the Apeiron clothing brand (wearapeiron.com),
built with Next.js (App Router) + Tailwind CSS. Source of truth for products,
cart, and checkout is the Shopify Storefront API.

## Stack

- **Next.js 16** — App Router, ISR (5-minute revalidation on catalog routes),
  Server Actions, Turbopack (default bundler), `output: 'standalone'`
- **React 19**, **Tailwind CSS 4**, **motion** (compositor-only animation),
  **zustand** (optimistic cart store), **zod** (input validation)
- **Shopify Storefront API** (catalog, cart) + **Shopify Admin API**
  (contact-message metaobjects, least-privilege scope)
- **Judge.me** (product reviews), **Navidium** (shipping protection),
  **Resend or vendored SMTP** (contact-form delivery)
- TypeScript, ESLint (`eslint-config-next`, aligned with the framework version),
  Vitest (unit + integration tests, `tests/`)

## Architecture

- **Catalog** (`/shop`, `/collection`, `/product/[slug]`): ISR with
  `revalidate = 300`. Pageviews don't hit Shopify live; a Shopify outage serves
  the last good render. Catalog reads degrade to an empty state rather than
  failing the build when Shopify is unreachable at build time.
- **Cart**: optimistic zustand cache reconciled against authoritative Shopify
  carts via Server Actions (`app/cart/actions.ts`). The cart id lives in an
  HTTP-only cookie (`__Host-` prefixed in production). Orphaned Navidium
  protection lines are swept server-side.
- **Checkout**: Shopify hosted checkout (redirect from the cart drawer). A
  custom `/checkout` flow exists but is dormant.
- **Shipping protection** (Navidium): quotes are priced **from the server-side
  cart** (`app/cart/protection.ts`) — see trust invariants below.
- **Reviews** (Judge.me): shop-wide review index fetched server-side
  (page 1, then remaining pages concurrently), filtered per product, cached
  5 minutes. Failure hides the section — never a page error.
- **Contact**: honeypot + time-trap + zod validation, dual delivery (Resend
  API or the vendored TLS-only SMTP client) plus a Shopify Admin metaobject
  record. SMTP headers are CRLF-stripped; the subject is RFC 2047 encoded.
- **Legal/help**: Shopify page content rendered through a whitelist HTML
  parser (no `dangerouslySetInnerHTML`); help content falls back to bundled
  copy when Shopify is unreachable.
- **Scroll performance**: the only scroll-linked animation (home hero
  parallax) is gated OFF on touch devices (`useCoarsePointer`) — a
  full-viewport CSS-filtered image being translated per scroll frame is the
  classic mobile jank source. Below-fold sections use `content-visibility:
  auto` (`.cv-auto`); fixed chrome stays opaque (no backdrop blur over
  scrolling content).

## Trust invariants (do not break)

1. **The browser never sends a price.** Cart mutations send only
   `merchandiseId` + `quantity`; the Navidium tier is computed from the
   server-side cart's Shopify prices. Anything money-adjacent is derived
   server-side.
2. **Server tokens never cross to the client.** Storefront/Admin/Judge.me/
   Resend/SMTP secrets are read only in `lib/` server modules (guarded by the
   `server-only` package where applicable).
3. **Failures degrade, they don't throw.** Reviews, protection, email, and
   help content all resolve to hidden/empty states on third-party failure.

## Security

- **HTTP security headers**: HSTS, `X-Frame-Options: DENY`, `nosniff`,
  Referrer-Policy, and Permissions-Policy are set in `next.config.ts`; the
  **Content-Security-Policy** is set in `proxy.ts` (Next.js 16's renamed
  request-interception hook, formerly `middleware.ts`), **enforced in
  production** (report-only in development so HMR is never blocked), and
  split by render mode:
  - **Dynamic routes** (cart, checkout, review, product/collection/
    collaborator detail, `/api/*`) get a strict **nonce-based** `script-src`:
    a fresh per-request nonce is forwarded via the `Content-Security-Policy`
    request header, Next.js stamps it onto its inline hydration/bootstrap
    scripts, and any inline script without the nonce is blocked.
  - **Static/ISR routes** (cached HTML — home, shop, story, help, contact,
    gate, catalog lists) get `script-src 'self' 'unsafe-inline' …`: a
    per-request nonce can never match cached HTML, so enforcing one there
    would break hydration for every visitor after the first. All other
    directives (`object-src 'none'`, `frame-ancestors 'none'`,
    `base-uri 'self'`, …) stay strict on every route.
  When adding an inline `<script>` of your own on a dynamic route, thread
  the request nonce into a `nonce` attribute — or the browser will refuse
  to execute it.
- **Rate limiting** is enforced at the edge (Cloudflare, in front of the
  Node server). Recommended WAF rules:
  - `POST /contact` (Server Action submissions): **10 requests/minute/IP**
  - `POST /api/gate` (launch access-code checks): **5 requests/minute/IP** —
    the route has no server-side throttle, so without an edge rule the access
    code is brute-forceable.
  - `POST /api/review` (review submissions): **5 requests/minute/IP** — the
    route's only spam defense is a honeypot.
  - Server Action mutations on `/cart`, `/shop`, `/product/*`, `/checkout`:
    **60 requests/minute/IP**
  Server Actions are POST requests to the page URL with the `Next-Action`
  header — scope the rules on that header to avoid throttling plain browsing.
- **Dependency CVE gate**: CI runs `npm audit --omit=dev --audit-level=high`.
  Keep Next.js current — Server Actions are this app's mutation surface.

## Environment variables

Server-side only — never expose them via `NEXT_PUBLIC_`. See `.env.example`
for the annotated template.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SHOPIFY_STORE_DOMAIN` | Yes | e.g. `your-store.myshopify.com` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Yes | Storefront API public token |
| `SHOPIFY_ADMIN_API_ACCESS_TOKEN` | Contact only | Admin API token, `write_metaobjects` scope only |
| `SHOPIFY_API_VERSION` | No | Defaults to `2026-01` |
| `NAVIDIUM_API_URL` | Protection only | Navidium quote lambda URL |
| `JUDGE_ME_API_TOKEN` | Reviews only | Judge.me private token |
| `RESEND_API_KEY` | Contact (option A) | Resend delivery |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Contact (option B) | Vendored TLS-only client (`SMTP_PORT` defaults to 465) |
| `CONTACT_EMAIL_TO` | Contact | Destination inbox |

## Development

```bash
npm ci
npm run dev        # http://localhost:3000
npm run lint
npm test           # vitest
npx tsc --noEmit
```

Builds tolerate missing Shopify env vars (catalog routes render their empty
state at build time and self-heal on the next revalidation), so CI and sandbox
builds work without secrets.

## CI

`.github/workflows/ci.yml` runs on every push/PR: `npm ci` → typecheck → lint
→ tests → `npm audit --omit=dev --audit-level=high`.

## Deployment

Standalone Node server (`output: 'standalone'`) behind Cloudflare. Run with
`NODE_ENV=production` so the image optimizer (sharp) and the `__Host-` cart
cookie are active. Set the env vars above; apply the Cloudflare WAF rate-limit
rules before opening real traffic.

Vercel preview deployments are unaffected by the standalone setting — it is
automatically disabled when `VERCEL` is set (see `next.config.ts`): on
Next.js 16.3 (Turbopack) a standalone build crashes Vercel's
`onBuildComplete` step (`ENOENT .next/next-server.js.nft.json`,
vercel/next.js#96646), and Vercel doesn't use the standalone folder anyway.
