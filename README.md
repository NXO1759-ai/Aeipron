# Aeipron — Headless Shopify Storefront

A production-ready Next.js headless ecommerce storefront powered by the Shopify Storefront API. The frontend is built with Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, and Zustand. Product data, collections, variants, pricing, and images are all sourced from Shopify — no mock data on the product-facing pages.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Components) |
| UI | React 19, Tailwind CSS v4 |
| Language | TypeScript (strict mode) |
| State | Zustand (cart — transitioning to Shopify Cart API) |
| Ecommerce | Shopify Storefront API (GraphQL, `2025-07` version) |
| Deployment | Vercel (standalone output) |

## Features

- **Shopify-backed product catalog** — products, variants, pricing, and images fetched from the Shopify Storefront API
- **Collection pages** — browse collections (categories) at `/collection`, drill into a specific collection at `/collection/[handle]`
- **Product detail pages** — image gallery, description, multi-dimension variant selectors (Size, Color, etc.) with in-stock/out-of-stock states
- **404 boundaries** — unknown product handles and collection handles render branded not-found pages
- **Server-only data layer** — the Shopify access token never reaches the browser bundle (enforced by `server-only` package + `import 'server-only'`)
- **Responsive design** — mobile-first grid that stacks to one column on small screens

## Project structure

```
app/
  collection/              # Collections index + collection detail pages
    [handle]/              # Specific collection page (e.g. /collection/shirts)
    page.tsx               # Collections index (/collection)
  product/
    [slug]/                # Product detail page (slug = Shopify product handle)
    ProductClient.tsx      # Client component for variant selection + add to bag
  checkout/                # Checkout page (mock — Phase 3 will wire to Shopify cart)
  collaborators/            # Organizer/collaborator pages (mock — Phase 4)
  story/                   # Brand story page
  layout.tsx               # Root layout (fonts, metadata)
  page.tsx                 # Home page (hero)
components/                # Header, Footer, CartDrawer, LayoutWrapper
hooks/                     # use-hydrated, use-mobile
lib/
  shopify/                 # Shopify integration layer (server-only)
    client.ts              # GraphQL fetcher (Node https, IPv4)
    queries.ts             # GraphQL operation strings
    adapter.ts             # Shopify response → domain types mapper
    types.ts               # Raw Shopify response shapes
  catalog.ts              # Public read API (getCollections, getProductBySlug, etc.)
  types.ts                # Domain types (Product, ProductOption, Collection, etc.)
  utils.ts                # cn() class merge utility
store/                     # Zustand cart store (mock — Phase 2 will wire to Shopify cart)
```

## Getting started

### Prerequisites

- **Node.js 20+** (tested on v20.20.2)
- A **Shopify store** with:
  - At least one product with variants (e.g. Size: Small/Medium/Large) and images
  - At least one Collection (e.g. "Shirts") containing products
  - A **custom app** with Storefront API access enabled

### Shopify setup

1. Go to **Shopify Admin → Settings → Apps and sales channels → Develop apps**.
2. Create or open your custom app.
3. Under **Configuration → Storefront API integration**, select these scopes:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_read_metaobjects`
4. Copy the **Storefront API access token** (NOT the Admin API access token — they're different strings even though both start with `shpat_`).
5. If the "Storefront API integration" section is not visible, create a public Storefront access token via the Admin API's `storefrontAccessTokenCreate` mutation.

### Environment variables

Create a `.env.local` file in the project root:

```bash
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your_storefront_access_token
SHOPIFY_API_VERSION=2025-07
```

> **Important:** These variables are server-only. Never prefix them with `NEXT_PUBLIC_` — that would expose the token to the browser. For Vercel deployment, set the same variables in Project Settings → Environment Variables.

A `.env.example` file with placeholder values is included in the repo.

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Install note

If you encounter peer dependency conflicts between `eslint-config-next` and `next`, install with:

```bash
npm install --legacy-peer-deps
```

This is a known issue with `eslint-config-next@16` and `next@15` version skew.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (typechecks + lints + compiles) |
| `npm run start` | Serve the standalone production build |
| `npm run lint` | Run ESLint |
| `npm run clean` | Clear the `.next/` cache |

`npm run build` is the primary verification gate — it runs both typecheck and lint with `ignoreBuildErrors: false` and `ignoreDuringBuilds: false`.

## Architecture notes

### Server-only Shopify client

All Shopify API calls go through `lib/shopify/client.ts`, which is marked server-only via `import 'server-only'`. Any attempt to import it from a client component will fail at build time. The client uses Node's built-in `https` module (not `fetch`) to force IPv4 connections, avoiding `ETIMEDOUT` issues in environments where IPv6 resolution times out.

### Product reads are dynamic

Product and collection pages use `export const dynamic = 'force-dynamic'` — they render on-demand at request time (not statically prerendered at build time). This is necessary because Shopify reads are network calls. ISR caching (`revalidate = 60`) will be added in Phase 6 for production performance.

### Variant GID on ProductOptionValue

Each `ProductOptionValue` carries a `variantId` field (the Shopify `ProductVariant` GID). This is preparation for Phase 2 (cart mutations), where the cart will need the variant GID to call `cartCreate` / `cartLinesAdd`. The product selector (`ProductClient.tsx`) already passes the selected variant's GID when adding to bag.

### Image handling

Product images come from Shopify's CDN (`cdn.shopify.com`), which is allow-listed in `next.config.ts` `remotePatterns`. In development, image optimization is disabled (`unoptimized: true` in dev) to avoid network issues in sandbox environments. In production on Vercel, the optimizer is active.

## Current status

### What's Shopify-backed (Phase 1 complete)
- `/collection` — lists all Shopify Collections
- `/collection/[handle]` — products in a specific Shopify Collection
- `/product/[slug]` — product detail with variants, images, pricing from Shopify

### What's still mock-backed (Phases 2–4)
- Cart (`store/use-cart.ts`) — local Zustand store, not yet wired to Shopify Cart API
- Checkout (`app/checkout/`) — mock server action, not yet redirecting to Shopify's hosted checkout
- Collaborators (`app/collaborators/`) — mock organizer data, not yet wired to Shopify Metaobjects

See `docs/IMPLEMENTATION_PLAN.md` for the full 6-phase plan.

## Documentation

| File | Purpose |
|---|---|
| `docs/JOB.md` | Client requirements and project objectives |
| `docs/SHOPIFY_API.md` | Shopify Storefront API reference (operations, scopes, cart flow, deprecated fields) |
| `docs/IMPLEMENTATION_PLAN.md` | 6-phase build plan with exit criteria |
| `docs/PHASE_1_TASKS.md` | Phase 1 task breakdown (10 tasks, all complete) |
| `docs/PROGRESS.md` | Development progress audit trail |

## Git configuration

This repo uses a local git config (not global) with:
- `user.name` = `bytebards`
- `user.email` = `bilalqureshi7358@gmail.com`
- `remote.origin.url` = `git@github-bilal:NXO1759-ai/Aeipron.git` (via `github-bilal` SSH host)

Do not override the local config or switch the remote to HTTPS.

## License

Proprietary. All rights reserved.