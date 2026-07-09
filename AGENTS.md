# AGENTS.md

Next.js 15 (App Router) + React 19 + TypeScript (strict) + Tailwind v4 + Zustand storefront prototype. Tests run on Vitest (45 adapter + query tests).

## Git identity (important)

This repo's git config is set **locally** (not global) to:
- `user.name` = `bytebards`
- `user.email` = `bilalqureshi7358@gmail.com`
- `remote.origin.url` = `git@github-bilal:NXO1759-ai/Aeipron.git` (uses the `github-bilal` SSH host from `~/.ssh/config`, IdentityFile `~/.ssh/bilal`)

The machine's **global** git config is a different identity (`Hamza` / `hhamza2937@gmail.com`) used for other repos. Do NOT override this repo's local config, do NOT commit with `--global` flags, and do NOT switch the remote back to HTTPS. If `git config user.name` returns something other than `bytebards`, stop and fix it before committing.

## Testing & verification protocol (mandatory)

Every code change — no exceptions — must pass this 3-step verification before committing:

1. **`npm run test`** — the full Vitest suite must pass. If you add or change a feature, write tests for it FIRST (or alongside), then run the suite. A PR that adds code without tests is incomplete.
2. **`npm run build`** — typecheck + lint + build must pass. This is the hard gate.
3. **Smoke test** — run `npm run dev` and curl the affected route(s) to confirm the page renders without server errors. For changes that touch the Shopify data layer, verify at minimum `/collection`, `/collection/[handle]`, and `/product/[slug]`. For UI-only changes, verify the specific page.

### Test requirements for new features

- Every new function in `lib/` (adapters, mappers, helpers) must have unit tests in `tests/`.
- Every new GraphQL query string in `lib/shopify/queries.ts` must have a test verifying: (a) required fields present, (b) deprecated fields absent, (c) structural validity (named operation, variables, fragments).
- Every new domain type change in `lib/types.ts` must have a fixture in `tests/fixtures/` and an adapter test that exercises it.
- Component tests (`@testing-library/react`) and store tests (Zustand) are encouraged but not mandatory for Tier 1 — add them when the feature touches interactive UI or state.

### Regression protection

- If a test breaks after your change, fix the test or revert the change — do NOT delete or skip the test to make it pass.
- If a test fails due to a Shopify API response shape change, update the fixture in `tests/fixtures/` to match the new shape, then update the adapter + test together.
- The test suite is the regression net for Phases 2–6. Never push code with a red test.

### Progress tracking

- After every completed task or feature, update `docs/PROGRESS.md` with: what changed, what tests were added, what was verified (build + test + smoke test results), and any decisions made. This is the audit trail for the 3-week timeline.

## Commands

- `npm run dev` — dev server
- `npm run build` — typechecks AND lints the build (both `ignoreBuildErrors`/`ignoreDuringBuilds` are `false` in `next.config.ts`); use this as your verification step
- `npm run test` — runs the Vitest test suite (`vitest run`); 45 adapter + query tests covering the Shopify data layer
- `npm run test:watch` — runs Vitest in watch mode (re-runs on file change)
- `npm run lint` — `eslint .` (flat config in `eslint.config.mjs`, extends `eslint-config-next`)
- `npm run start` — serve the standalone build (`output: 'standalone'`)
- `npm run clean` — clears `.next/`

There is no `typecheck` script. To typecheck without a full build: `npx tsc --noEmit` (tsconfig is already `noEmit`).

**Verification sequence for every code change:** `npm run test` → `npm run build` → smoke test (dev server + curl). Do not commit until all three pass.

## Architecture & trust boundaries

- **`lib/catalog.ts` is the server-only source of truth for products and prices.** Do NOT import it from any `'use client'` component — it must not reach the browser bundle. Today it's in-memory mock data; swapping for a DB changes only function bodies, not signatures.
- **The client never supplies prices.** `CartLine` (`lib/types.ts`) deliberately omits `price`. The checkout server action (`app/checkout/actions.ts`) re-prices every line from `getCatalogPrice(id, size)`, which throws on unknown SKUs / unoffered sizes. Keep this invariant when touching cart or checkout code.
- **`MAX_QTY_PER_LINE = 10` is mirrored in two places** (`store/use-cart.ts` and `app/checkout/actions.ts`). Change both together; the server action is the enforcing boundary.
- **Cart line identity is `id + size`**, not `id` alone. Use the `lineKey(id, size)` pattern already in `store/use-cart.ts`.
- Cart state is Zustand, persisted to `localStorage` under key `aeipron-cart`, `partialize`d to `items` only (drawer open/closed state is NOT persisted).

## Conventions

- Path alias: `@/*` -> repo root (e.g. `@/lib/catalog`, `@/components/Header`).
- Class merging: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Do not hand-roll template-string class composition.
- Tailwind v4 (not v3). Theme tokens are defined inline via `@theme` in `app/globals.css` — custom colors like `apeiron-black`, `apeiron-ivory`, `accent-energy`. No `tailwind.config.js`.
- Fonts (Space Grotesk `--font-sans`, Inter `--font-inter`) load via `next/font/google` in `app/layout.tsx`; reference through the CSS variables, not raw family names.
- Product/organizer routes are dynamic: `app/product/[slug]`, `app/collaborators/[organizerId]`. Each has a colocated `not-found.tsx`.

## Config gotchas

- `next.config.ts` `transpilePackages: ['motion']` — required for the `motion` package; keep it.
- The webpack block in `next.config.ts` disables HMR when `DISABLE_HMR=true`. Do not modify — AI Studio relies on it to stop file-watching during agent edits.
- Remote images are allow-listed for `picsum.photos` only (`next.config.ts` `remotePatterns`). All mock imagery uses `picsum.photos/seed/...`; adding other hosts requires editing the config.
- `metadata.json` describes the app for AI Studio's hosting layer; keep `name`/`description` in sync with `app/layout.tsx` metadata.

## Directory ownership

- `app/` — routes, pages, and the one server action (`checkout/actions.ts`).
- `components/` — shared UI (Header, Footer, CartDrawer, LayoutWrapper).
- `lib/` — `catalog.ts` (data/pricing), `types.ts` (framework-agnostic domain types), `utils.ts` (`cn`).
- `store/` — Zustand stores (cart).
- `hooks/` — client hooks (`use-hydrated`, `use-mobile`).

## `/docs` Directory

This directory contains all project documentation and is used to track every aspect of development.

### `/docs/JOB.md`

* Contains the current project objectives and client requirements.
* Review this file before starting any new task or work session to understand the current priorities and goals.

### `/docs/PROGRESS.md`

* Maintains a complete record of the project's development progress.
* After completing any task or making significant updates, document the changes in this file to keep an accurate history of the project's progress.

### `/docs/SHOPIFY_API.md`

* Authoritative reference for the Shopify Storefront API integration described in `JOB.md`.
* Defines the one GraphQL endpoint, the 9 operations (queries + mutations) the frontend calls, environment variables, cart/checkout flow, and the Metaobject model for organizers.
* Includes a section-by-section rewrite checklist mapping each existing file to its Shopify-backed replacement. Read this before touching `lib/catalog.ts`, `store/use-cart.ts`, `app/checkout/actions.ts`, or any product/organizer route.

### `/docs/IMPLEMENTATION_PLAN.md`

* Phased, verifiable build plan that operationalizes `SHOPIFY_API.md` and `JOB.md`.
* Six phases: (1) Shopify client + product reads, (2) cart mutations + Shopify-cart-backed store, (3) checkout handoff, (4) organizers via Metaobjects, (5) cleanup + image migration, (6) full-journey QA + Vercel deployment readiness.
* Each phase has explicit exit criteria ending with `npm run build` passing. Read this before starting any phase of the integration; update `docs/PROGRESS.md` at the end of each phase as the audit trail.

### `/docs/PHASE_1_TASKS.md`

* Production-grade task breakdown for Phase 1 (Shopify client + product reads).
* 10 tasks with explicit acceptance criteria, commit messages, and verification steps. Created before implementation begins so the work can be executed task-by-task without ambiguity.
* Read this before starting Phase 1 implementation. Each task ends with `npm run build` passing where it changes code.
