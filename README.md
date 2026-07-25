# Apeiron — Headless Shopify Storefront

A headless Shopify storefront for the Apeiron clothing brand (wearapeiron.com),
built with Next.js (App Router) + Tailwind CSS. Source of truth for products,
cart, and checkout is the Shopify Storefront API.

## Stack

- **Next.js 15.5** — App Router, ISR (5-minute revalidation on catalog routes),
  Server Actions, `output: 'standalone'`
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

- **HTTP security headers** set in `next.config.ts` (HSTS, `X-Frame-Options:
  DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, and a **report-only**
  CSP — flip `Content-Security-Policy-Report-Only` to enforced after one clean
  deploy cycle).
- **Rate limiting** is enforced at the edge (Cloudflare, in front of the
  Node server). Recommended WAF rules:
  - `POST /contact` (Server Action submissions): **10 requests/minute/IP**
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
| `SHOPIFY_STOREFRONT_API_TOKEN` | Yes | Storefront API public token |
| `SHOPIFY_ADMIN_API_TOKEN` | Contact only | Admin API token, `write_metaobjects` scope only |
| `SHOPIFY_API_VERSION` | No | Defaults to `2026-01` |
| `NAVIDIUM_API_URL` | Protection only | Navidium quote lambda URL |
| `JUDGE_ME_API_TOKEN` | Reviews only | Judge.me private token |
| `RESEND_API_KEY` | Contact (option A) | Resend delivery |
| `SMTP_URL` | Contact (option B) | `smtps://user:pass@host:465` — vendored TLS-only client |
| `CONTACT_INBOX` | Contact | Destination inbox |

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
