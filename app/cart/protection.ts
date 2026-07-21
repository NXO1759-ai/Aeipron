'use server';

// ---------------------------------------------------------------------------
// Cart shipping-protection server action — the ONLY way the client requests a
// Navidium quote. Validates the merchandise lines server-side (never trust the
// client), derives the tier total, and delegates to the Navidium client
// (lib/navidium.ts). Returns null on any invalid input or quote failure — the
// toggle then stays hidden; this action never throws into the drawer.
// ---------------------------------------------------------------------------

import { getProtectionQuote, type ProtectionQuote } from '@/lib/navidium';

/** Hard cap so a crafted payload can never make the quote request unbounded. */
const MAX_LINES = 250;

/** One merchandise line the drawer quotes on (protection line excluded). */
export interface ProtectionQuoteLine {
  merchandiseId: string;
  price: number;
  quantity: number;
}

export interface ProtectionQuoteRequest {
  lines: ProtectionQuoteLine[];
  countryName?: string;
}

/** Extract the numeric id from a Shopify variant GID for Navidium's product_id. */
function numericIdFromGid(merchandiseId: string): string {
  const match = /ProductVariant\/(\d+)/.exec(merchandiseId);
  return match ? match[1] : merchandiseId;
}

/**
 * Quote shipping protection for the current merchandise lines. The tier price
 * depends only on the cart total, but the full item list is forwarded so
 * Navidium can apply any product-level rules on its side.
 */
export async function getShippingProtectionQuote(
  input: ProtectionQuoteRequest,
): Promise<ProtectionQuote | null> {
  const lines = input?.lines;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) {
    console.error('[navidium] invalid line count for protection quote');
    return null;
  }
  for (const line of lines) {
    const valid =
      line &&
      typeof line.merchandiseId === 'string' &&
      line.merchandiseId.length > 0 &&
      Number.isFinite(line.price) &&
      line.price >= 0 &&
      Number.isInteger(line.quantity) &&
      line.quantity > 0;
    if (!valid) {
      console.error('[navidium] invalid merchandise line in protection quote request');
      return null;
    }
  }

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
    countryName: typeof input.countryName === 'string' ? input.countryName : undefined,
  });
}
