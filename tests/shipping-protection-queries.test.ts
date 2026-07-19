import { describe, it, expect, vi } from 'vitest';

// queries.ts imports 'server-only' (build-time guard against client imports);
// under Vitest its default export throws, so mock it to an empty module.
vi.mock('server-only', () => ({}));

import { SHIPPING_PROTECTION_QUERY } from '@/lib/shopify/queries';

// ---------------------------------------------------------------------------
// SHIPPING_PROTECTION_QUERY string validation.
//
// Mirrors tests/queries.test.ts / tests/cart-queries.test.ts: required-field
// presence, deprecated-field absence (comment-stripped), and structural
// validity (named op, typed $handle variable, the `product(handle:)` entry, and
// `variants(first: 250)` so all 100 tiers load in one call). Catches drift at
// test time without a live Shopify connection.
// ---------------------------------------------------------------------------

describe('SHIPPING_PROTECTION_QUERY — required fields present', () => {
  it('selects product id / handle / title', () => {
    expect(SHIPPING_PROTECTION_QUERY).toContain('id');
    expect(SHIPPING_PROTECTION_QUERY).toContain('handle');
    expect(SHIPPING_PROTECTION_QUERY).toContain('title');
  });

  it('selects variant id / title / availableForSale / price', () => {
    expect(SHIPPING_PROTECTION_QUERY).toContain('availableForSale');
    expect(SHIPPING_PROTECTION_QUERY).toContain('price');
    expect(SHIPPING_PROTECTION_QUERY).toContain('amount');
    expect(SHIPPING_PROTECTION_QUERY).toContain('currencyCode');
  });

  it('fetches up to 250 variants (the live product has 100 — one call, no pagination)', () => {
    expect(SHIPPING_PROTECTION_QUERY).toContain('variants(first: 250)');
  });
});

describe('SHIPPING_PROTECTION_QUERY — deprecated fields absent', () => {
  const deprecatedFields = ['priceV2', 'compareAtPriceV2', 'originalSrc', 'transformedSrc', 'src'];
  it('contains no deprecated fields', () => {
    const withoutComments = SHIPPING_PROTECTION_QUERY.replace(/#.*$/gm, '');
    for (const field of deprecatedFields) {
      expect(withoutComments).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
  });
});

describe('SHIPPING_PROTECTION_QUERY — structural validity', () => {
  it('uses a named query operation', () => {
    expect(SHIPPING_PROTECTION_QUERY).toContain('query ShippingProtectionProduct');
  });

  it('types $handle as String! and passes it as a variable (not interpolated)', () => {
    expect(SHIPPING_PROTECTION_QUERY).toContain('$handle: String!');
    expect(SHIPPING_PROTECTION_QUERY).toContain('product(handle: $handle)');
  });

  it('variants use the nodes connection shape (NOT edges — Product.variants is node-based)', () => {
    expect(SHIPPING_PROTECTION_QUERY).toContain('nodes');
    expect(SHIPPING_PROTECTION_QUERY).not.toContain('edges');
  });

  it('does NOT reuse the ProductFields fragment (which caps variants at 50)', () => {
    expect(SHIPPING_PROTECTION_QUERY).not.toContain('...ProductFields');
  });
});