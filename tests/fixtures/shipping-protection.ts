// ---------------------------------------------------------------------------
// Captain Shipping Protection fixture — matches the LIVE `shipping-protection`
// product (verified via the Storefront + Admin APIs).
//
// The product has 100 variants:
//   - 99 percentage-grid tiers: $1.00, $2.01, $3.02, … $99.98 (step $1.01).
//     title = the fee as a string ("1.00", "2.01", …).
//   - 1 "*3.00" outlier (price $3.00) — Captain's "default fixed price"
//     fallback, excluded from the percentage grid (see ladder.ts isGridVariant).
//
// Generated here so ladder + store tests don't need a live Shopify connection.
// Variant GIDs use a stable synthetic pattern so tests are deterministic.
// ---------------------------------------------------------------------------

import type { ProtectionVariant } from '@/lib/shipping-protection/types';

/** The 99 grid tiers ($1.00 → $99.98 in $1.01 steps) + the *3.00 fallback. */
export const PROTECTION_VARIANTS: ProtectionVariant[] = [
  // The merchant's default fixed-price fallback — leading "*" → NOT a grid tier.
  { id: 'gid://shopify/ProductVariant/10000000000001', title: '*3.00', price: 3.0 },
  // 99 grid tiers: price = 1.00 + n * 1.01 for n = 0..98.
  ...Array.from({ length: 99 }, (_, n) => {
    const price = 1.0 + n * 1.01;
    return {
      id: `gid://shopify/ProductVariant/${10000000000002 + n}`,
      // Captain titles grid tiers with the fee as a 2-decimal string.
      title: price.toFixed(2),
      price: Math.round(price * 100) / 100,
    } satisfies ProtectionVariant;
  }),
];

/** Just the percentage-grid tiers (the *3.00 fallback removed), price-sorted. */
export const PROTECTION_GRID: ProtectionVariant[] = PROTECTION_VARIANTS.filter(
  (v) => !v.title.startsWith('*'),
).sort((a, b) => a.price - b.price);

/**
 * A ProtectionConfig the store / UI would receive from the server action, at the
 * documented example rate of 2% (the merchant must confirm the real value via
 * CAPTAIN_PROTECTION_RATE).
 */
export const PROTECTION_CONFIG = {
  variants: PROTECTION_VARIANTS,
  rate: 0.02,
} as const;

/** The protection product handle (matches the live Shopify product). */
export const SHIPPING_PROTECTION_HANDLE = 'shipping-protection';