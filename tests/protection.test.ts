import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Protection-line detection tests (lib/protection.ts).
//
// The Navidium "Protected Checkout" product must be recognized at EVERY point
// in a cart line's life — optimistic (name only, no handle), reconciled
// (Shopify's product title + handle), and rehydrated after a reload — because
// it never renders as a cart row and the toggle's on/off state reads through
// here. Regressing the name-only check ('protection' ≠ 'Protected Checkout')
// is what showed the line as a product and flipped the toggle off.
// ---------------------------------------------------------------------------

import {
  isProtectionLine,
  merchandiseLinesOf,
  protectionLineOf,
  protectionQuantityOf,
} from '@/lib/protection';

/** The reconciled line, exactly as Shopify returns it. */
const RECONCILED = { name: 'Protected Checkout', productHandle: 'shipping-protection-1', quantity: 1 };
/** The optimistic line, as the toggle adds it before the server round-trip. */
const OPTIMISTIC = { name: 'Shipping protection', productHandle: '', quantity: 1 };
const HOODIE = { name: 'Hoodie', productHandle: 'hoodie', quantity: 2 };
const TEE = { name: 'Euro Tee', productHandle: 'euro-tee', quantity: 1 };

describe('isProtectionLine', () => {
  it('matches the reconciled Navidium product by handle', () => {
    expect(isProtectionLine(RECONCILED)).toBe(true);
    expect(isProtectionLine({ name: 'Protected Checkout', productHandle: 'shipping-protection' })).toBe(true);
  });

  it('matches the optimistic line by name before the handle exists', () => {
    expect(isProtectionLine(OPTIMISTIC)).toBe(true);
  });

  it('matches the reconciled product title even without a handle', () => {
    expect(isProtectionLine({ name: 'Protected Checkout', productHandle: '' })).toBe(true);
  });

  it('does not match ordinary merchandise', () => {
    expect(isProtectionLine(HOODIE)).toBe(false);
    expect(isProtectionLine(TEE)).toBe(false);
    expect(isProtectionLine({ name: 'Hoodie', productHandle: '' })).toBe(false);
  });

  it('trusts the handle over the name when both are present', () => {
    // A merchandise line whose NAME coincidentally matches the pattern but
    // whose handle is a normal product stays merchandise.
    expect(isProtectionLine({ name: 'Shipping protection', productHandle: 'hoodie' })).toBe(false);
  });
});

describe('merchandiseLinesOf / protectionLineOf', () => {
  it('partitions a mixed cart', () => {
    const lines = [HOODIE, RECONCILED, TEE];
    expect(merchandiseLinesOf(lines)).toEqual([HOODIE, TEE]);
    expect(protectionLineOf(lines)).toBe(RECONCILED);
  });

  it('returns all lines and null when protection is absent', () => {
    const lines = [HOODIE, TEE];
    expect(merchandiseLinesOf(lines)).toEqual(lines);
    expect(protectionLineOf(lines)).toBeNull();
  });
});

describe('protectionQuantityOf', () => {
  it('sums only protection quantities so the bag count can exclude them', () => {
    expect(protectionQuantityOf([HOODIE, RECONCILED, OPTIMISTIC])).toBe(2);
    expect(protectionQuantityOf([HOODIE, TEE])).toBe(0);
  });
});
