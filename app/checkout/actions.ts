'use server';

// ---------------------------------------------------------------------------
// Checkout server action.
//
// The browser sends only { id, size, quantity } per line. Prices, the line
// math, shipping, and the grand total are all computed here from the catalog,
// the server's source of truth. A tampered `price` in the browser has nowhere
// to land because we never read one off the request.
//
// In production this is where you'd create the payment-processor intent
// (Stripe PaymentIntent, etc.) with the server-derived `amount`. The demo stops
// short of charging and just returns the trusted figures.
// ---------------------------------------------------------------------------

import { getCatalogPrice, getShipping } from '@/lib/catalog';
import type { CartLine } from '@/lib/types';

const MAX_QTY_PER_LINE = 10;

export interface CheckoutResult {
  ok: boolean;
  error?: string;
  amount?: number;
  subtotal?: number;
  shipping?: number;
  currency?: string;
}

export async function createCheckout(lines: CartLine[]): Promise<CheckoutResult> {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, error: 'Your bag is empty.' };
  }

  let subtotal = 0;
  try {
    for (const line of lines) {
      const qty = Math.floor(Number(line.quantity));
      if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
        return { ok: false, error: 'One of your items has an invalid quantity.' };
      }
      // Price comes from the catalog, keyed only by id + size. Throws on any
      // unknown SKU or unoffered size.
      const unit = getCatalogPrice(String(line.id), String(line.size));
      subtotal += unit * qty;
    }
  } catch {
    // Don't echo internal SKU details back to the client.
    return { ok: false, error: 'We could not verify one of your items. Please refresh your bag.' };
  }

  const shipping = getShipping(subtotal);
  const amount = subtotal + shipping;

  // --- payment intent creation would go here, using `amount` ---

  return { ok: true, subtotal, shipping, amount, currency: 'USD' };
}
