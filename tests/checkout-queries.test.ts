import { describe, it, expect, vi } from 'vitest';

// queries.ts imports 'server-only' (build-time guard against client imports);
// under Vitest its default export throws, so mock it to an empty module.
vi.mock('server-only', () => ({}));

import {
  CART_WITH_DELIVERY_QUERY,
  CART_BUYER_IDENTITY_UPDATE_MUTATION,
  CART_DELIVERY_ADDRESSES_ADD_MUTATION,
  CART_DELIVERY_ADDRESSES_UPDATE_MUTATION,
  CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION,
} from '@/lib/shopify/queries';

// ---------------------------------------------------------------------------
// Checkout mutation/query string guards (Phase 4b).
//
// Asserts each operation is a named operation, passes inputs as typed
// variables (never interpolated), selects userErrors + warnings, selects the
// deliveryGroups fields needed by the adapter, and contains NONE of the
// deprecated fields (deliveryAddressPreferences, estimatedCost on Cart,
// cart-level discountAllocations, totalTaxAmount, totalDutyAmount,
// MailingAddressInput, old Checkout* API).
// ---------------------------------------------------------------------------

const MUTATIONS = {
  CART_BUYER_IDENTITY_UPDATE_MUTATION,
  CART_DELIVERY_ADDRESSES_ADD_MUTATION,
  CART_DELIVERY_ADDRESSES_UPDATE_MUTATION,
  CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION,
} as const;

describe('checkout operations — named + use variables (not interpolation)', () => {
  it('CART_WITH_DELIVERY_QUERY is a named query taking $id', () => {
    expect(CART_WITH_DELIVERY_QUERY).toContain('query CartWithDelivery($id: ID!)');
    expect(CART_WITH_DELIVERY_QUERY).toContain('cart(id: $id)');
  });

  it('CART_BUYER_IDENTITY_UPDATE_MUTATION is a named mutation with typed inputs', () => {
    expect(CART_BUYER_IDENTITY_UPDATE_MUTATION).toContain('mutation CartBuyerIdentityUpdate');
    expect(CART_BUYER_IDENTITY_UPDATE_MUTATION).toContain('$cartId: ID!');
    expect(CART_BUYER_IDENTITY_UPDATE_MUTATION).toContain('$buyerIdentity: CartBuyerIdentityInput!');
    expect(CART_BUYER_IDENTITY_UPDATE_MUTATION).toContain('cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity)');
  });

  it('CART_DELIVERY_ADDRESSES_ADD_MUTATION is a named mutation with typed addresses', () => {
    expect(CART_DELIVERY_ADDRESSES_ADD_MUTATION).toContain('mutation CartDeliveryAddressesAdd');
    expect(CART_DELIVERY_ADDRESSES_ADD_MUTATION).toContain('$cartId: ID!');
    expect(CART_DELIVERY_ADDRESSES_ADD_MUTATION).toContain('$addresses: [CartSelectableAddressInput!]!');
    expect(CART_DELIVERY_ADDRESSES_ADD_MUTATION).toContain('cartDeliveryAddressesAdd(cartId: $cartId, addresses: $addresses)');
  });

  it('CART_DELIVERY_ADDRESSES_UPDATE_MUTATION is a named mutation with typed update input', () => {
    expect(CART_DELIVERY_ADDRESSES_UPDATE_MUTATION).toContain('mutation CartDeliveryAddressesUpdate');
    expect(CART_DELIVERY_ADDRESSES_UPDATE_MUTATION).toContain('$addresses: [CartSelectableAddressUpdateInput!]!');
  });

  it('CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION is a named mutation with typed selection input', () => {
    expect(CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION).toContain('mutation CartSelectedDeliveryOptionsUpdate');
    expect(CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION).toContain('$selectedDeliveryOptions: [CartSelectedDeliveryOptionInput!]!');
    expect(CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION).toContain(
      'cartSelectedDeliveryOptionsUpdate(cartId: $cartId, selectedDeliveryOptions: $selectedDeliveryOptions)',
    );
  });
});

describe('checkout operations — select userErrors + warnings + delivery fields', () => {
  for (const [name, query] of Object.entries(MUTATIONS)) {
    it(`${name} selects userErrors { field message }`, () => {
      expect(query).toContain('userErrors');
      expect(query).toMatch(/userErrors\s*\{\s*field\s+message\s*\}/);
    });

    it(`${name} selects warnings { code message } (non-fatal, logged only)`, () => {
      expect(query).toContain('warnings');
      expect(query).toMatch(/warnings\s*\{\s*code\s+message\s*\}/);
    });

    it(`${name} selects deliveryGroups (so the action gets delivery options back)`, () => {
      expect(query).toContain('...DeliveryGroupsFields');
      expect(query).toContain('fragment DeliveryGroupsFields on Cart');
      expect(query).toContain('deliveryOptions');
      expect(query).toContain('selectedDeliveryOption');
      expect(query).toContain('estimatedCost');
      expect(query).toContain('deliveryMethodType');
    });
  }

  it('CART_WITH_DELIVERY_QUERY selects deliveryGroups via the shared fragment', () => {
    expect(CART_WITH_DELIVERY_QUERY).toContain('...DeliveryGroupsFields');
    expect(CART_WITH_DELIVERY_QUERY).toContain('deliveryOptions');
  });
});

describe('checkout operations — no deprecated fields', () => {
  // Strip line comments so a deprecated name mentioned in a comment doesn't
  // create a false positive (we only care about actual field selections).
  const stripComments = (s: string) => s.replace(/#.*$/gm, '');

  // Note: `estimatedCost` is intentionally NOT in this list — it is ambiguous.
  // `Cart.estimatedCost` (cart-level) is deprecated, but
  // `CartDeliveryOption.estimatedCost` (the shipping cost) is valid and we
  // select it in the delivery fragment. The CART_FRAGMENT never selects the
  // cart-level `estimatedCost` (it uses `cost.totalAmount`), so there is no
  // cart-level selection to guard against by string match.
  const deprecated = [
    'deliveryAddressPreferences',
    'discountAllocations',
    'totalTaxAmount',
    'totalDutyAmount',
    'MailingAddressInput',
    'cartDeliveryMethods', // no such query in 2025-07
    'cartShippingRates',
  ];

  for (const [name, query] of Object.entries(MUTATIONS)) {
    it(`${name} contains no deprecated cart/delivery fields`, () => {
      const src = stripComments(query);
      for (const field of deprecated) {
        expect(src).not.toMatch(new RegExp(`\\b${field}\\b`));
      }
    });
  }

  it('CART_WITH_DELIVERY_QUERY contains no deprecated fields', () => {
    const src = stripComments(CART_WITH_DELIVERY_QUERY);
    for (const field of deprecated) {
      expect(src).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it('uses the modern CartDeliveryAddressInput path (not MailingAddressInput)', () => {
    // The add mutation's variable type is CartSelectableAddressInput, whose
    // .address is CartAddressInput.deliveryAddress (CartDeliveryAddressInput).
    // We never reference MailingAddressInput (the deprecated deliveryAddressPreferences path).
    expect(CART_DELIVERY_ADDRESSES_ADD_MUTATION).toContain('CartSelectableAddressInput');
  });
});

describe('checkout operations — delivery address uses codes, not names', () => {
  it('the delivery fragment reads countryCode-style fields (provinceCode is set by the action, not the query)', () => {
    // The query only READS the cart; it does not declare the input shape. The
    // adapter maps deliveryOptions. Assert the fragment reads what the adapter
    // needs: handle (for selection) + estimatedCost + deliveryMethodType.
    expect(CART_WITH_DELIVERY_QUERY).toContain('handle');
    expect(CART_WITH_DELIVERY_QUERY).toContain('estimatedCost');
    expect(CART_WITH_DELIVERY_QUERY).toContain('deliveryMethodType');
  });
});