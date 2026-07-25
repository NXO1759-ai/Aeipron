'use server';

// ---------------------------------------------------------------------------
// Cart shipping-protection server action — the ONLY way the client requests a
// Navidium quote.
//
// TRUST INVARIANT (shared with app/cart/actions.ts): the browser NEVER sends a
// price. The quote's tier total and item prices are derived from the
// AUTHORITATIVE server-side cart (Shopify is the price source of truth), never
// from the request payload — a crafted request cannot talk the tier down.
// The client may only pass an optional country override.
//
// Returns null on any failure (no cart, empty merchandise, quote failure) —
// the toggle then stays hidden; this action never throws into the drawer.
// ---------------------------------------------------------------------------

import { getCart } from '@/app/cart/actions';
import { getProtectionQuote, type ProtectionQuote } from '@/lib/navidium';
import { merchandiseLinesOf } from '@/lib/protection';

export interface ProtectionQuoteRequest {
  /**
   * Optional shipping-country override for Navidium's rules. Everything that
   * affects MONEY (lines, prices, tier total) comes from the server cart.
   */
  countryName?: string;
}

/** Extract the numeric id from a Shopify variant GID for Navidium's product_id. */
function numericIdFromGid(merchandiseId: string): string {
  const match = /ProductVariant\/(\d+)/.exec(merchandiseId);
  return match ? match[1] : merchandiseId;
}

/**
 * Quote shipping protection for the caller's current cart. The merchandise
 * lines and their prices are read from the server-side Shopify cart (via the
 * HTTP-only cart cookie), so the tier always reflects what is actually in the
 * bag. The tier price depends only on the merchandise subtotal, but the full
 * item list is forwarded so Navidium can apply any product-level rules.
 */
export async function getShippingProtectionQuote(
  input?: ProtectionQuoteRequest,
): Promise<ProtectionQuote | null> {
  // The authoritative cart. getCart() returns null when there is no cart
  // cookie or the cart has expired; a Shopify transport failure throws, which
  // also resolves to "no quote" here — the toggle stays hidden either way.
  let cart: Awaited<ReturnType<typeof getCart>>;
  try {
    cart = await getCart();
  } catch {
    console.error('[navidium] cart read failed while quoting protection');
    return null;
  }
  if (!cart) return null;

  const lines = merchandiseLinesOf(cart.lines);
  if (lines.length === 0) return null;

  // Round to cents — floating-point sums like 19.99*3 must not drift the tier.
  const totalPrice =
    Math.round(lines.reduce((acc, line) => acc + line.price * line.quantity, 0) * 100) / 100;

  return getProtectionQuote({
    totalPrice,
    items: lines.map((line) => ({
      productId: numericIdFromGid(line.merchandiseId),
      price: line.price,
      quantity: line.quantity,
    })),
    countryName: typeof input?.countryName === 'string' ? input.countryName : undefined,
  });
}
