import { describe, it, expect, vi } from 'vitest';

// queries.ts imports 'server-only' (build-time guard against client imports);
// under Vitest its default export throws, so mock it to an empty module.
vi.mock('server-only', () => ({}));

import {
  COLLECTION_LIST_QUERY,
  COLLECTION_BY_HANDLE_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
} from '@/lib/shopify/queries';

// ---------------------------------------------------------------------------
// Query string validation — catches deprecated fields, missing fields, and
// syntax errors at test time without needing a live Shopify connection.
// ---------------------------------------------------------------------------

const ALL_QUERIES = {
  COLLECTION_LIST_QUERY,
  COLLECTION_BY_HANDLE_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
} as const;

describe('GraphQL queries — required fields present', () => {
  it('PRODUCT_BY_HANDLE_QUERY contains availableForSale (stock UI)', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('availableForSale');
  });

  it('COLLECTION_BY_HANDLE_QUERY contains availableForSale (stock UI)', () => {
    expect(COLLECTION_BY_HANDLE_QUERY).toContain('availableForSale');
  });

  it('PRODUCT_BY_HANDLE_QUERY contains handle (URL routing)', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('handle');
  });

  it('PRODUCT_BY_HANDLE_QUERY contains selectedOptions (variant data)', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('selectedOptions');
  });

  it('PRODUCT_BY_HANDLE_QUERY contains price (variant pricing)', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('price');
  });

  it('PRODUCT_BY_HANDLE_QUERY contains images (gallery)', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('images');
  });

  it('PRODUCT_BY_HANDLE_QUERY contains featuredImage (card fallback)', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('featuredImage');
  });

  it('PRODUCT_BY_HANDLE_QUERY selects the variant image (gallery switches with variant)', () => {
    // The variant image lives inside the variants.nodes selection of the
    // shared ProductFields fragment (used by both the detail + collection
    // queries). Assert it is selected so the gallery can follow the variant.
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('image {');
    expect(PRODUCT_BY_HANDLE_QUERY).toMatch(/variants\(first: 50\)[\s\S]*image \{/);
  });

  it('COLLECTION_BY_HANDLE_QUERY also selects the variant image (shared fragment)', () => {
    expect(COLLECTION_BY_HANDLE_QUERY).toContain('image {');
  });

  it('COLLECTION_LIST_QUERY contains collections (list query)', () => {
    expect(COLLECTION_LIST_QUERY).toContain('collections');
  });

  it('COLLECTION_BY_HANDLE_QUERY contains collectionByHandle', () => {
    expect(COLLECTION_BY_HANDLE_QUERY).toContain('collectionByHandle');
  });
});

describe('GraphQL queries — deprecated fields absent', () => {
  const deprecatedFields = [
    'priceV2',
    'compareAtPriceV2',
    'productByHandle',
    'originalSrc',
    'transformedSrc',
    'estimatedCost',
    'discountAllocations',
  ];

  for (const [queryName, query] of Object.entries(ALL_QUERIES)) {
    it(`${queryName} contains no deprecated fields`, () => {
      for (const field of deprecatedFields) {
        // Match the field as a word boundary, not inside a comment.
      const withoutComments = query.replace(/\/\/.*$/gm, '');
      expect(withoutComments).not.toMatch(new RegExp(`\\b${field}\\b`));
      }
    });
  }
});

describe('GraphQL queries — structural validity', () => {
  it('PRODUCT_BY_HANDLE_QUERY uses a named operation', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('query ProductByHandle');
  });

  it('COLLECTION_LIST_QUERY uses a named operation', () => {
    expect(COLLECTION_LIST_QUERY).toContain('query CollectionList');
  });

  it('COLLECTION_BY_HANDLE_QUERY uses a named operation', () => {
    expect(COLLECTION_BY_HANDLE_QUERY).toContain('query CollectionByHandle');
  });

  it('PRODUCT_BY_HANDLE_QUERY passes handle as a variable (not interpolated)', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('$handle: String!');
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('product(handle: $handle)');
  });

  it('COLLECTION_BY_HANDLE_QUERY passes handle as a variable', () => {
    expect(COLLECTION_BY_HANDLE_QUERY).toContain('$handle: String!');
    expect(COLLECTION_BY_HANDLE_QUERY).toContain('collectionByHandle(handle: $handle)');
  });

  it('PRODUCT_BY_HANDLE_QUERY includes the ProductFields fragment', () => {
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('...ProductFields');
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('fragment ProductFields on Product');
  });

  it('PRODUCT_BY_HANDLE_QUERY selects the custom product metafields (Rich Text)', () => {
    // The three `custom` namespace metafields back the Details & Fabrication /
    // Product Care / Product Sizing disclosures on the PDP. Selected via
    // aliased `metafield(namespace:, key:)` so the response keys match the
    // domain fields. (Collection cards use the shared fragment and do NOT
    // select these — only the detail query pays for them.)
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('namespace: "custom", key: "details_fabrication"');
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('namespace: "custom", key: "product_care"');
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('namespace: "custom", key: "product_sizing"');
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('detailsFabrication: metafield(');
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('productCare: metafield(');
    expect(PRODUCT_BY_HANDLE_QUERY).toContain('productSizing: metafield(');
  });

  it('COLLECTION_BY_HANDLE_QUERY does NOT select the product metafields (shared fragment only)', () => {
    // Metafields are a detail-page concern; the collection grid must not pull
    // them for every card.
    expect(COLLECTION_BY_HANDLE_QUERY).not.toContain('details_fabrication');
    expect(COLLECTION_BY_HANDLE_QUERY).not.toContain('product_care');
    expect(COLLECTION_BY_HANDLE_QUERY).not.toContain('product_sizing');
  });

  it('COLLECTION_BY_HANDLE_QUERY includes the ProductFields fragment', () => {
    expect(COLLECTION_BY_HANDLE_QUERY).toContain('...ProductFields');
    expect(COLLECTION_BY_HANDLE_QUERY).toContain('fragment ProductFields on Product');
  });
});