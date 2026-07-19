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
//   - The merchant sets a PERCENTAGE rate in the Captain dashboard (the docs use
//     2% as an illustrative example; the merchant configures the real value).
//   - The fee = cart merchandise subtotal × rate, snapped to a pre-priced
//     variant grid: 99 tiers from $1.00 in $1.01 increments (max $99.98). Each
//     tier is a real Shopify ProductVariant; the charged fee is always one of
//     these variants — never an arbitrary number.
//   - A 100th variant titled "*3.00" (a leading `*`) is the merchant's "default
//     fixed price" fallback used by the FIXED pricing method / when no
//     percentage rule applies. It is NOT part of the percentage grid and is
//     excluded here.
//
// ⚠️ MERCHANT MUST CONFIRM the rate matches their Captain dashboard setting
// (env `CAPTAIN_PROTECTION_RATE`) AND that the percentage method (not the
// fixed-tier method) is what they configured. The grid + nearest-tier snapping
// are derived from the live variant prices, so they stay correct even if
// Captain re-ladders fees; only the rate is an assumed input.
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
 * `rate` is the merchant's Captain percentage (e.g. 0.02 for 2%). The target
 * fee is `subtotal × rate`; the returned variant is the GRID tier whose price is
 * NEAREST to that target (clamped to the lowest/highest tier when the target is
 * outside the grid). Returns `null` when there are no grid tiers (the product
 * is not visible to the Storefront API, or all variants are the `*` fallback).
 *
 * Nearest-tier snapping (not "smallest ≥") matches Captain's "calculated
 * estimated price" → closest pre-priced variant. It uses the REAL variant
 * prices fetched from the API, so it is robust to fee re-laddering.
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

  // Nearest by absolute distance. Ties (equidistant) resolve to the lower fee
  // (the `<=` below keeps the first/cheaper one when distances are equal) so we
  // never round a boundary up unnecessarily.
  let best = grid[0];
  let bestDist = Math.abs(grid[0].price - target);
  for (let i = 1; i < grid.length; i++) {
    const dist = Math.abs(grid[i].price - target);
    if (dist < bestDist) {
      best = grid[i];
      bestDist = dist;
    }
  }
  return best;
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