import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a numeric amount as a localized currency string.
 *
 * Used for cart line prices, subtotals, and the checkout "Estimated total".
 * `amount` is already parsed from Shopify's Decimal string → number by the
 * adapter; `currencyCode` comes from the Shopify response (e.g. 'USD').
 *
 * Production notes:
 *   - Uses Intl.NumberFormat so formatting is locale- and currency-correct
 *     (symbol, decimal places, grouping) without hand-rolled `.toFixed(2)`.
 *   - Falls back to a plain decimal string if the currency code is missing or
 *     Intl does not recognise it — never throws on display data.
 *   - Does NOT round the input; Intl handles currency rounding rules per the
 *     currency code (e.g. JPY has 0 fraction digits).
 */
export function formatCurrency(amount: number, currencyCode = 'USD'): string {
  if (!Number.isFinite(amount)) return '0';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  } catch {
    // Unknown/empty currency code — fall back to a safe decimal representation.
    return amount.toFixed(2);
  }
}
