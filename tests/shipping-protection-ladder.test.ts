import { describe, it, expect } from 'vitest';

import {
  resolveProtectionVariant,
  protectionFeeFor,
  isGridVariant,
  gridVariants,
  isProtectionLine,
  merchandiseSubtotalOf,
  computeProtectionOffering,
} from '@/lib/shipping-protection/ladder';
import type { ProtectionVariant } from '@/lib/shipping-protection/types';
import type { CartLine } from '@/lib/types';
import {
  PROTECTION_VARIANTS,
  PROTECTION_GRID,
} from './fixtures/shipping-protection';

// ---------------------------------------------------------------------------
// Pure resolver tests — no Shopify, no env, no DOM. Locks the fee formula
// (cart subtotal × rate → round UP to the next grid tier, grid minimum applies
// below the floor) and the cart-level helpers (protection-line identification,
// merchandise-subtotal exclusion, offering).
// ---------------------------------------------------------------------------

const RATE = 0.02;

describe('isGridVariant', () => {
  it('excludes the *-prefixed default fixed-price fallback', () => {
    expect(isGridVariant({ id: '1', title: '*3.00', price: 3 })).toBe(false);
    expect(isGridVariant({ id: '2', title: '1.00', price: 1 })).toBe(true);
  });
});

describe('gridVariants', () => {
  it('drops the * fallback and sorts by price ascending', () => {
    const grid = gridVariants(PROTECTION_VARIANTS);
    expect(grid).toHaveLength(99);
    expect(grid[0].price).toBe(1.0);
    expect(grid[grid.length - 1].price).toBe(99.98);
    // No *-prefixed titles survive.
    expect(grid.every((v) => !v.title.startsWith('*'))).toBe(true);
    // Strictly ascending.
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i].price).toBeGreaterThan(grid[i - 1].price);
    }
  });

  it('returns [] when only the fallback variant exists', () => {
    expect(gridVariants([{ id: '1', title: '*3.00', price: 3 }])).toEqual([]);
  });
});

describe('resolveProtectionVariant', () => {
  it('returns null when there are no grid tiers', () => {
    expect(resolveProtectionVariant([], 100, RATE)).toBeNull();
    expect(resolveProtectionVariant([{ id: '1', title: '*3.00', price: 3 }], 100, RATE)).toBeNull();
  });

  it('rounds UP to the next grid tier above subtotal × rate', () => {
    // $220 cart × 2% = $4.40 target. Grid: 4.03 (< 4.40) and 5.04 (≥ 4.40) → 5.04
    // (Captain's "closest price variant UPWARDS" rule).
    const v = resolveProtectionVariant(PROTECTION_VARIANTS, 220, RATE);
    expect(v).not.toBeNull();
    expect(v!.price).toBe(5.04);
  });

  it('clamps to the lowest tier when the target is below the grid', () => {
    // $10 × 2% = $0.20 → below the $1.00 minimum → $1.00 (minimum applies).
    expect(resolveProtectionVariant(PROTECTION_VARIANTS, 10, RATE)!.price).toBe(1.0);
  });

  it('clamps to the highest tier when the target is above the grid', () => {
    // $10000 × 2% = $200 → above the $99.98 maximum → $99.98.
    expect(resolveProtectionVariant(PROTECTION_VARIANTS, 10000, RATE)!.price).toBe(99.98);
  });

  it('handles a non-finite subtotal without throwing (falls back to lowest)', () => {
    expect(resolveProtectionVariant(PROTECTION_VARIANTS, Number.NaN, RATE)!.price).toBe(1.0);
  });

  it('is robust to unsorted variant input (sorts internally)', () => {
    const shuffled = [...PROTECTION_GRID].reverse();
    expect(resolveProtectionVariant(shuffled, 220, RATE)!.price).toBe(5.04);
  });

  it('a boundary exactly on a tier picks that tier', () => {
    // $50 × 2% = $1.00 exactly → $1.00 (on the tier → that tier).
    expect(resolveProtectionVariant(PROTECTION_VARIANTS, 50, RATE)!.price).toBe(1.0);
    // $100 × 2% = $2.00 → no $2.00 tier; round up to the next tier ≥ 2.00 → 2.01.
    expect(resolveProtectionVariant(PROTECTION_VARIANTS, 100, RATE)!.price).toBe(2.01);
  });

  it('respects the rate (a higher rate lifts the tier for the same subtotal)', () => {
    // $100 × 4% = $4.00 → round up to the next tier ≥ 4.00 → 4.03.
    expect(resolveProtectionVariant(PROTECTION_VARIANTS, 100, 0.04)!.price).toBe(4.03);
    // $100 × 2% = $2.00 → round up → 2.01.
    expect(resolveProtectionVariant(PROTECTION_VARIANTS, 100, 0.02)!.price).toBe(2.01);
  });

  it('rounds UP on a tie (never rounds a boundary down)', () => {
    // Build a 2-tier grid: $1.00 and $3.00. Target $2.00 is exactly between →
    // round up to $3.00 (the smallest tier ≥ 2.00).
    const two: ProtectionVariant[] = [
      { id: 'a', title: '1.00', price: 1 },
      { id: 'b', title: '3.00', price: 3 },
    ];
    expect(resolveProtectionVariant(two, 100, 0.02)!.price).toBe(3);
  });
});

describe('protectionFeeFor', () => {
  it('returns the resolved tier price', () => {
    expect(protectionFeeFor(PROTECTION_VARIANTS, 220, RATE)).toBe(5.04);
  });
  it('returns 0 when no grid exists', () => {
    expect(protectionFeeFor([], 220, RATE)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cart-level helpers
// ---------------------------------------------------------------------------

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: 'gid://shopify/CartLine/x',
    merchandiseId: 'gid://shopify/ProductVariant/999',
    name: 'Hoodie',
    price: 30,
    variantLabel: 'Black / L',
    quantity: 1,
    image: '',
    currencyCode: 'USD',
    ...overrides,
  };
}

describe('isProtectionLine', () => {
  it('matches a line whose merchandiseId is a protection variant', () => {
    const prot = PROTECTION_GRID[5];
    expect(isProtectionLine(line({ merchandiseId: prot.id }), PROTECTION_VARIANTS)).toBe(true);
  });
  it('does not match a regular product line', () => {
    expect(isProtectionLine(line({ merchandiseId: 'gid://shopify/ProductVariant/999' }), PROTECTION_VARIANTS)).toBe(false);
  });
  it('also recognizes the * fallback variant as a protection line', () => {
    const fallback = PROTECTION_VARIANTS[0]; // *3.00
    expect(isProtectionLine(line({ merchandiseId: fallback.id }), PROTECTION_VARIANTS)).toBe(true);
  });
});

describe('merchandiseSubtotalOf', () => {
  it('sums price×qty excluding the protection line', () => {
    const prot = PROTECTION_GRID[5];
    const items: CartLine[] = [
      line({ merchandiseId: 'gid://shopify/ProductVariant/hoodie', price: 30, quantity: 2 }),
      line({ lineId: 'prot', merchandiseId: prot.id, price: prot.price, quantity: 1 }),
    ];
    // 30×2 = 60; the protection line is excluded.
    expect(merchandiseSubtotalOf(items, PROTECTION_VARIANTS)).toBe(60);
  });
  it('returns the full subtotal when no protection line is present', () => {
    const items: CartLine[] = [line({ price: 30, quantity: 2 }), line({ price: 50, quantity: 1 })];
    expect(merchandiseSubtotalOf(items, PROTECTION_VARIANTS)).toBe(110);
  });
  it('returns 0 for an empty cart', () => {
    expect(merchandiseSubtotalOf([], PROTECTION_VARIANTS)).toBe(0);
  });
});

describe('computeProtectionOffering', () => {
  it('returns the correct variant id + fee for the merchandise subtotal', () => {
    const items: CartLine[] = [line({ price: 110, quantity: 2 })]; // 220 merchandise
    const off = computeProtectionOffering(items, PROTECTION_VARIANTS, RATE);
    expect(off).not.toBeNull();
    expect(off!.fee).toBe(5.04);
    // merchandiseId is the grid tier with price 5.04.
    const expected = PROTECTION_GRID.find((v) => v.price === 5.04)!;
    expect(off!.merchandiseId).toBe(expected.id);
  });
  it('excludes an existing protection line from the subtotal used for the fee', () => {
    const prot = PROTECTION_GRID.find((v) => v.price === 5.04)!;
    const items: CartLine[] = [
      line({ price: 110, quantity: 2 }), // 220 merchandise
      line({ lineId: 'prot', merchandiseId: prot.id, price: prot.price, quantity: 1 }),
    ];
    // Merchandise subtotal is 220 (protection excluded) → fee still 5.04, no feedback loop.
    const off = computeProtectionOffering(items, PROTECTION_VARIANTS, RATE);
    expect(off!.fee).toBe(5.04);
    expect(off!.merchandiseId).toBe(prot.id);
  });
  it('returns null when no grid is available', () => {
    expect(computeProtectionOffering([line()], [], RATE)).toBeNull();
  });
});