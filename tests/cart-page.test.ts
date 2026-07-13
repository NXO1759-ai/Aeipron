import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// /cart page — routing + SEO guards.
//
// The cart page is a thin Server-Component shell over the tested Zustand cart
// store (cart-store / cart-actions tests cover the behavior). What MUST NOT
// silently regress is routing + indexing policy:
//   - `force-dynamic`: a per-buyer, cookie-bound cart must never be prerendered
//     or cached at build time (would leak one shopper's cart into the build).
//   - `robots: { index: false, follow: false }`: a transient cart page is not a
//     canonical, linkable destination and must not appear in search indexes.
//
// Asserted as source-string checks (same approach as the GraphQL query tests)
// to avoid importing Next App-Router modules into the node Vitest environment.
// ---------------------------------------------------------------------------

const PAGE_SOURCE = readFileSync(
  resolve(process.cwd(), 'app/cart/page.tsx'),
  'utf8',
);

describe('/cart page routing', () => {
  it('is force-dynamic (per-buyer cart must never be prerendered)', () => {
    expect(PAGE_SOURCE).toContain("dynamic = 'force-dynamic'");
  });
});

describe('/cart page SEO', () => {
  it('opts out of search indexing (noindex, nofollow)', () => {
    expect(PAGE_SOURCE).toContain('robots');
    expect(PAGE_SOURCE).toContain('index: false');
    expect(PAGE_SOURCE).toContain('follow: false');
  });
});