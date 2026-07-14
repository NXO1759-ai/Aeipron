import { describe, it, expect, vi } from 'vitest';

// adapter.ts imports 'server-only' (build-time guard against client imports);
// under Vitest its default export throws, so mock it to an empty module.
vi.mock('server-only', () => ({}));

import { mapDeliveryGroups, mapCheckoutDetails, mapCart } from '@/lib/shopify/adapter';
import {
  twoOptionsCartNode,
  selectedOptionCartNode,
  noOptionsCartNode,
  noDeliveryFieldCartNode,
} from './fixtures/checkout-cart-node';

// ---------------------------------------------------------------------------
// mapDeliveryGroups + mapCheckoutDetails tests (Phase 4b).
// Verifies option mapping (handle, cost parse, deliveryMethodType), the
// selected-handle mapping, the empty-options edge, and the no-deliveryField
// fallback (plain cart get → []). Also asserts the trust invariant: the
// browser-sent handle is opaque and carries no price.
// ---------------------------------------------------------------------------

describe('mapDeliveryGroups', () => {
  it('returns [] when deliveryGroups was not selected (plain cart get)', () => {
    expect(mapDeliveryGroups(noDeliveryFieldCartNode)).toEqual([]);
  });

  it('maps each delivery option (handle, title, description, cost, type)', () => {
    const groups = mapDeliveryGroups(twoOptionsCartNode);
    expect(groups).toHaveLength(1);
    const options = groups[0].deliveryOptions;
    expect(options).toHaveLength(2);

    expect(options[0]).toEqual({
      handle: 'shopify-Standard-0',
      code: 'standard',
      title: 'Standard Shipping',
      description: '5-7 business days',
      cost: { amount: 5, currencyCode: 'USD' },
      deliveryMethodType: 'SHIPPING',
    });

    expect(options[1].cost.amount).toBe(15);
    expect(options[1].cost.currencyCode).toBe('USD');
  });

  it('parses the Decimal string cost to a number', () => {
    const groups = mapDeliveryGroups(twoOptionsCartNode);
    expect(typeof groups[0].deliveryOptions[0].cost.amount).toBe('number');
  });

  it('maps selectedHandle from selectedDeliveryOption.handle', () => {
    const groups = mapDeliveryGroups(selectedOptionCartNode);
    expect(groups[0].selectedHandle).toBe('shopify-Express-1');
  });

  it('maps selectedHandle to null when no option is selected', () => {
    const groups = mapDeliveryGroups(twoOptionsCartNode);
    expect(groups[0].selectedHandle).toBeNull();
  });

  it('maps the delivery group id (needed for cartSelectedDeliveryOptionsUpdate)', () => {
    const groups = mapDeliveryGroups(twoOptionsCartNode);
    expect(groups[0].id).toBe('gid://shopify/CartDeliveryGroup/dg-1');
  });

  it('returns an empty deliveryOptions array (not null) when the country has no shipping zone', () => {
    const groups = mapDeliveryGroups(noOptionsCartNode);
    expect(groups).toHaveLength(1);
    expect(groups[0].deliveryOptions).toEqual([]);
    expect(groups[0].selectedHandle).toBeNull();
  });

  it('preserves option order as returned by Shopify (first-seen)', () => {
    const groups = mapDeliveryGroups(twoOptionsCartNode);
    expect(groups[0].deliveryOptions.map((o) => o.handle)).toEqual([
      'shopify-Standard-0',
      'shopify-Express-1',
    ]);
  });

  it('the mapped handle carries NO price field (trust invariant: browser sends only handle)', () => {
    const groups = mapDeliveryGroups(twoOptionsCartNode);
    const json = JSON.stringify(groups);
    // handle is opaque and must not embed a price the browser could send back.
    expect(json).not.toMatch(/"handle":"[^"]*price[^"]*"/i);
  });
});

describe('mapCheckoutDetails', () => {
  it('returns cart (via mapCart) + deliveryGroups in one object', () => {
    const details = mapCheckoutDetails(twoOptionsCartNode);
    expect(details.cart).toEqual(mapCart(twoOptionsCartNode));
    expect(details.deliveryGroups).toHaveLength(1);
  });

  it('cart totals are parsed from Decimal strings', () => {
    const details = mapCheckoutDetails(twoOptionsCartNode);
    expect(details.cart.subtotalAmount).toBe(20);
    expect(details.cart.totalAmount).toBe(20);
    expect(details.cart.totalAmountEstimated).toBe(true);
  });

  it('reflects shipping in totalAmount when an option is selected', () => {
    const details = mapCheckoutDetails(selectedOptionCartNode);
    expect(details.cart.totalAmount).toBe(35); // 20 subtotal + 15 express
    expect(details.deliveryGroups[0].selectedHandle).toBe('shopify-Express-1');
  });

  it('returns empty deliveryGroups when deliveryGroups was not selected', () => {
    const details = mapCheckoutDetails(noDeliveryFieldCartNode);
    expect(details.deliveryGroups).toEqual([]);
    expect(details.cart.totalQuantity).toBe(2);
  });

  it('returns empty deliveryGroups when the country has no shipping zone', () => {
    const details = mapCheckoutDetails(noOptionsCartNode);
    expect(details.deliveryGroups).toHaveLength(1);
    expect(details.deliveryGroups[0].deliveryOptions).toEqual([]);
  });
});