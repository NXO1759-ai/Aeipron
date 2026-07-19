// ---------------------------------------------------------------------------
// Shipping-protection resolver — pure, framework-agnostic, no `server-only`.
//
// This is the SINGLE place that maps a cart subtotal to the correct Captain
// protection variant. It is intentionally pure (no Shopify, no env, no I/O) so
// it can run client-side inside the Zustand store to recompute the correct tier
// when the cart changes, and so it unit-tests in the node Vitest env.
//
// HOW CAPTAIN PRICING WORKS (per docs.captaintop.com/shipping-protection-pricing,
// verified against the live product's 100 variants):
//   - The merchant sets a PERCENTAGE rate in the Captain dashboard (the client
//     confirmed 1% for this store; it is driven live from the
//     `shipping_protection_content` metaobject `rate` field, falling back to the
//     `CAPTAIN_PROTECTION_RATE` env var).
//   - The fee = cart merchandise subtotal × rate, mapped to a pre-priced
//     variant grid: 99 tiers from $1.00 in $1.01 increments (max $99.98). Each
//     tier is a real Shopify ProductVariant; the charged fee is always one of
//     these variants — never an arbitrary number.
//   - Captain selects the grid tier via "closest price variant UPWARDS" — round
//     UP to the smallest tier whose price ≥ the computed fee — and applies the
//     grid MINIMUM when the computed fee is below the floor (e.g. $220 × 2% =
//     $4.40 → bracketed by $4.03 and $5.04 → charges $5.04; $50 × 1% = $0.50,
//     below the $1.00 floor → charges $1.00).
//   - A 100th variant titled "*3.00" (a leading `*`) is the merchant's "default
//     fixed price" fallback used by the FIXED pricing method / when no
//     percentage rule applies. It is NOT part of the percentage grid and is
//     excluded here.
//
// ⚠️ The rate now comes from the Shopify metaobject (merchant-editable); the env
// var is a fallback. The grid + round-up + min/max are derived from the live
// variant prices, so they stay correct even if Captain re-ladders fees.
// ---------------------------------------------------------------------------

import type { CartLine } from '@/lib/types';
import type { ProtectionVariant } from './types';

/**
 * Is this variant part of the percentage fee grid? Captain marks the
 * "default fixed price" fallback variant with a leading `*` in its title
 * (e.g. "*3.00"); that variant is excluded from the percentage grid. Only
 * variants whose title does NOT start with `*` are grid tiers.
 */
export function isGridVariant(variant: ProtectionVariant): boolean {
  return !variant.title.startsWith('*');
}

/**
 * The grid tiers from a variant list, sorted by price ascending. Excludes the
 * `*`-prefixed default-fixed-price variant. Sorted so the nearest-tier lookup
 * and min/max clamping are deterministic regardless of API ordering.
 */
export function gridVariants(variants: ProtectionVariant[]): ProtectionVariant[] {
  return variants.filter(isGridVariant).sort((a, b) => a.price - b.price);
}

/**
 * Resolve the correct protection variant for a given cart merchandise subtotal.
 *
 * `rate` is the merchant's Captain percentage (e.g. 0.01 for 1%). The target
 * fee is `subtotal × rate`; the returned variant is the GRID tier whose price is
 * the SMALLEST price `>= target` — i.e. round UP to the next tier — matching
 * Captain's "closest price variant UPWARDS" selection rule. Returns `null` when
 * there are no grid tiers (the product is not visible to the Storefront API, or
 * all variants are the `*` fallback).
 *
 * Boundary behavior (per Captain's docs):
 *   - `target <= grid[0].price` → the grid MINIMUM applies (the lowest tier is
 *     charged; e.g. 1% of a $50 cart = $0.50, below the $1.00 grid floor → $1.00).
 *   - `target > grid[max].price` → clamp to the highest tier (can't exceed the
 *     grid; carts over the grid's max pay the top fee).
 *
 * It uses the REAL variant prices fetched from the API, so it is robust to fee
 * re-laddering — if Captain re-prices the grid, the round-up + min/max track it.
 */
export function resolveProtectionVariant(
  variants: ProtectionVariant[],
  cartSubtotal: number,
  rate: number,
): ProtectionVariant | null {
  const grid = gridVariants(variants);
  if (grid.length === 0) return null;

  const target = Number(cartSubtotal) * rate;
  if (!Number.isFinite(target)) return grid[0];

  const min = grid[0];
  const max = grid[grid.length - 1];
  if (target <= min.price) return min; // below the grid floor → minimum applies
  if (target > max.price) return max; // above the grid ceiling → clamp

  // Round UP: the smallest grid tier whose price is >= target. The grid is
  // sorted ascending (gridVariants), so the first tier at/above the target is
  // the round-up result. A target exactly on a tier returns that tier.
  for (let i = 0; i < grid.length; i++) {
    if (grid[i].price >= target) return grid[i];
  }
  return max; // unreachable given the clamp above, but keeps TS happy
}

/**
 * The protection fee for a given subtotal — the resolved grid tier's price, or
 * `0` when no grid is available. Convenience for UI display without re-running
 * the resolver's return-value unwrap.
 */
export function protectionFeeFor(
  variants: ProtectionVariant[],
  cartSubtotal: number,
  rate: number,
): number {
  return resolveProtectionVariant(variants, cartSubtotal, rate)?.price ?? 0;
}

/**
 * Is this cart line the protection line? Matches the line's `merchandiseId`
 * (ProductVariant GID) against ANY variant of the protection product — grid OR
 * the `*` fallback — so a protection line added by any path is recognized.
 */
export function isProtectionLine(
  line: CartLine,
  variants: ProtectionVariant[],
): boolean {
  return variants.some((v) => v.id === line.merchandiseId);
}

/**
 * The cart's MERCHANDISE subtotal — the sum of line prices × quantities
 * EXCLUDING the protection line. The protection fee is computed from this
 * (never from a subtotal that already includes the fee), so adding protection
 * can't inflate its own tier in a feedback loop.
 */
export function merchandiseSubtotalOf(
  items: CartLine[],
  variants: ProtectionVariant[],
): number {
  return items
    .filter((line) => !isProtectionLine(line, variants))
    .reduce((sum, line) => sum + line.price * line.quantity, 0);
}

/**
 * The protection offering for the current cart: the correct variant id to add
 * and the fee to display, derived from the merchandise subtotal. Returns `null`
 * when no grid is available (the toggle renders nothing in that case).
 *
 * Used by the toggle UI and the store's toggle/reconcile paths so both compute
 * the offering from ONE function and can never disagree.
 */
export function computeProtectionOffering(
  items: CartLine[],
  variants: ProtectionVariant[],
  rate: number,
): { merchandiseId: string; fee: number } | null {
  const resolved = resolveProtectionVariant(
    variants,
    merchandiseSubtotalOf(items, variants),
    rate,
  );
  if (!resolved) return null;
  return { merchandiseId: resolved.id, fee: resolved.price };
}