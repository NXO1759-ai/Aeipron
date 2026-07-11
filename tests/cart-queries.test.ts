import { describe, it, expect, vi } from 'vitest';

// queries.ts imports 'server-only' (build-time guard against client imports);
// under Vitest its default export throws, so mock it to an empty module.
vi.mock('server-only', () => ({}));

import {
  CART_GET_QUERY,
  CART_CREATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_LINES_REMOVE_MUTATION,
} from '@/lib/shopify/queries';

// ---------------------------------------------------------------------------
// Cart GraphQL query/mutation string validation.
//
// Mirrors tests/queries.test.ts: required-field presence, deprecated-field
// absence (comment-stripping regex so a field named in a comment doesn't trip
// the check), and structural validity (named ops, typed $variables, the
// mandatory `... on ProductVariant` inline-fragment pattern on the Merchandise
// union). Catches drift at test time without needing a live Shopify connection.
// ---------------------------------------------------------------------------

const ALL_CART_OPS = {
  CART_GET_QUERY,
  CART_CREATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_LINES_REMOVE_MUTATION,
} as const;

describe('Cart GraphQL ops — required fields present', () => {
  it('every cart op selects totalQuantity (feeds the bag badge, NOT line count)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('totalQuantity');
    }
  });

  it('every cart op selects checkoutUrl (redirect target for hosted checkout)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('checkoutUrl');
    }
  });

  it('every cart op selects cost (subtotal + estimated total)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('cost');
    }
  });

  it('every cart op selects subtotalAmount', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('subtotalAmount');
    }
  });

  it('every cart op selects totalAmount', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('totalAmount');
    }
  });

  it('every cart op selects totalAmountEstimated (UI labels "Estimated total")', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('totalAmountEstimated');
    }
  });

  it('every cart op selects lines (the cart-line connection)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('lines');
    }
  });

  it('every cart op selects amountPerQuantity (unit price per line)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('amountPerQuantity');
    }
  });

  it('every cart op selects merchandise (the line merchandise)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('merchandise');
    }
  });

  it('every cart op uses the inline fragment on ProductVariant (Merchandise union)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('... on ProductVariant');
    }
  });

  it('every cart op selects selectedOptions on the variant (size resolution)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('selectedOptions');
    }
  });

  it('every cart op selects product.title (line display name)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('product');
      expect(op).toContain('title');
    }
  });

  it('every cart op includes the CartFields fragment', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      expect(op).toContain('...CartFields');
      expect(op).toContain('fragment CartFields on Cart');
    }
  });
});

describe('Cart GraphQL ops — deprecated fields absent', () => {
  const deprecatedFields = [
    'priceV2',
    'compareAtPriceV2',
    'estimatedCost',
    'discountAllocations',
    'originalSrc',
    'transformedSrc',
  ];

  for (const [opName, op] of Object.entries(ALL_CART_OPS)) {
    it(`${opName} contains no deprecated fields`, () => {
      const withoutComments = op.replace(/\/\/.*$/gm, '');
      for (const field of deprecatedFields) {
        // Match the field as a word boundary, not inside a comment.
        expect(withoutComments).not.toMatch(new RegExp(`\\b${field}\\b`));
      }
    });
  }
});

describe('Cart GraphQL ops — structural validity', () => {
  it('CART_GET_QUERY uses a named query operation', () => {
    expect(CART_GET_QUERY).toContain('query CartGet');
  });

  it('CART_CREATE_MUTATION uses a named mutation operation', () => {
    expect(CART_CREATE_MUTATION).toContain('mutation CartCreate');
  });

  it('CART_LINES_ADD_MUTATION uses a named mutation operation', () => {
    expect(CART_LINES_ADD_MUTATION).toContain('mutation CartLinesAdd');
  });

  it('CART_LINES_UPDATE_MUTATION uses a named mutation operation', () => {
    expect(CART_LINES_UPDATE_MUTATION).toContain('mutation CartLinesUpdate');
  });

  it('CART_LINES_REMOVE_MUTATION uses a named mutation operation', () => {
    expect(CART_LINES_REMOVE_MUTATION).toContain('mutation CartLinesRemove');
  });

  it('CART_GET_QUERY types $id as ID! and passes it as a variable', () => {
    expect(CART_GET_QUERY).toContain('$id: ID!');
    expect(CART_GET_QUERY).toContain('cart(id: $id)');
  });

  it('CART_CREATE_MUTATION types $input as CartInput!', () => {
    expect(CART_CREATE_MUTATION).toContain('$input: CartInput!');
    expect(CART_CREATE_MUTATION).toContain('cartCreate(input: $input)');
  });

  it('CART_LINES_ADD_MUTATION types $cartId as ID! and $lines as a list', () => {
    expect(CART_LINES_ADD_MUTATION).toContain('$cartId: ID!');
    expect(CART_LINES_ADD_MUTATION).toContain('$lines: [CartLineInput!]!');
    expect(CART_LINES_ADD_MUTATION).toContain('cartLinesAdd(cartId: $cartId, lines: $lines)');
  });

  it('CART_LINES_UPDATE_MUTATION types $cartId as ID! and $lines as a list', () => {
    expect(CART_LINES_UPDATE_MUTATION).toContain('$cartId: ID!');
    expect(CART_LINES_UPDATE_MUTATION).toContain('$lines: [CartLineUpdateInput!]!');
    expect(CART_LINES_UPDATE_MUTATION).toContain('cartLinesUpdate(cartId: $cartId, lines: $lines)');
  });

  it('CART_LINES_REMOVE_MUTATION types $cartId as ID! and $lineIds as a list', () => {
    expect(CART_LINES_REMOVE_MUTATION).toContain('$cartId: ID!');
    expect(CART_LINES_REMOVE_MUTATION).toContain('$lineIds: [ID!]!');
    expect(CART_LINES_REMOVE_MUTATION).toContain('cartLinesRemove(cartId: $cartId, lineIds: $lineIds)');
  });

  it('every mutation selects userErrors with field + message', () => {
    const mutations = [
      CART_CREATE_MUTATION,
      CART_LINES_ADD_MUTATION,
      CART_LINES_UPDATE_MUTATION,
      CART_LINES_REMOVE_MUTATION,
    ];
    for (const m of mutations) {
      expect(m).toContain('userErrors');
      expect(m).toContain('field');
      expect(m).toContain('message');
    }
  });

  it('cart lines use the edges/node connection shape (NOT nodes)', () => {
    for (const op of Object.values(ALL_CART_OPS)) {
      // The Cart.lines connection is edge-based; verify the shape appears.
      expect(op).toContain('edges');
      expect(op).toContain('node {');
    }
  });
});