// ---------------------------------------------------------------------------
// Shipping-protection line detection (Navidium).
//
// Navidium's "Protected Checkout" is a real Shopify product (it has to be —
// only a ProductVariant can sit in a cart), but it is NOT merchandise: it
// must never render as a row in the cart drawer or on /cart, and the
// protection toggle locates the active line through here.
//
// Detection is layered so it holds at every point in a line's life:
//   1. PRODUCT HANDLE — server-reconciled lines always carry
//      merchandise.product.handle; Navidium's product is created with a
//      'shipping-protection…' handle ('shipping-protection-1' on this store).
//   2. DISPLAY NAME — optimistic lines (added before the server round-trip,
//      no handle yet) are named 'Shipping protection'; the reconciled product
//      title is 'Protected Checkout'. Both match the name pattern.
//
// The name check alone was NOT sufficient (it matched 'protection' but not
// the reconciled title 'Protected Checkout' — the line then rendered as a
// product and the toggle read as off). Handle-first matching fixes that.
// ---------------------------------------------------------------------------

import type { CartLine } from '@/lib/types';

/** Matches Navidium's product handles ('shipping-protection', 'shipping-protection-1', …). */
const PROTECTION_HANDLE_PATTERN = /protection/i;

/** Matches the reconciled product title and the optimistic line name. */
const PROTECTION_NAME_PATTERN = /protected checkout|shipping protection|shipping insurance/i;

type LineLike = Pick<CartLine, 'name' | 'productHandle'>;

/** True when a cart line is Navidium's protection product, not merchandise. */
export function isProtectionLine(line: LineLike): boolean {
  if (line.productHandle) return PROTECTION_HANDLE_PATTERN.test(line.productHandle);
  return PROTECTION_NAME_PATTERN.test(line.name);
}

/** The merchandise lines — everything that is not the protection product. */
export function merchandiseLinesOf<T extends LineLike>(lines: T[]): T[] {
  return lines.filter((line) => !isProtectionLine(line));
}

/** The active protection line, if the cart has one (quantity is always 1). */
export function protectionLineOf<T extends LineLike>(lines: T[]): T | null {
  return lines.find(isProtectionLine) ?? null;
}

/**
 * Total quantity sitting in protection lines. The bag count subtracts this so
 * toggling protection never inflates "Bag (n)" — the toggle itself (and the
 * subtotal) is the only visible signal.
 */
export function protectionQuantityOf(lines: (LineLike & { quantity: number })[]): number {
  return lines.filter(isProtectionLine).reduce((acc, line) => acc + line.quantity, 0);
}

/**
 * True only when the live quote points at a DIFFERENT variant than the active
 * protection line — a genuine tier/product change that justifies a remove+add.
 *
 * A price mismatch ALONE never justifies a swap: the reconciled Shopify
 * variant price is authoritative for the charge, and re-adding the same
 * variant reconciles to the same server price — so a price-aware condition
 * can only loop (remove → re-add → same mismatch → repeat). That loop is what
 * made the drawer toggle switch on and off by itself when Navidium's widget
 * config diverged from the variant's Shopify price.
 */
export function protectionSwapNeeded(
  line: Pick<CartLine, 'merchandiseId'>,
  quote: { variantId: string; price?: number },
): boolean {
  return line.merchandiseId !== quote.variantId;
}

/**
 * One swap attempt per target variant per cart state. If Shopify reconciles
 * the cart to something other than the quote's variant (platform desync),
 * retrying the same target just re-runs the same remove+add — an infinite
 * loop that flips the toggle on and off. The caller records the target before
 * each attempt and clears the record when the merchandise state changes, so a
 * genuinely new cart earns one fresh attempt.
 */
export function protectionSwapAttemptAllowed(
  line: Pick<CartLine, 'merchandiseId'>,
  quote: { variantId: string; price?: number },
  lastSwapTarget: string | null,
): boolean {
  return protectionSwapNeeded(line, quote) && quote.variantId !== lastSwapTarget;
}
