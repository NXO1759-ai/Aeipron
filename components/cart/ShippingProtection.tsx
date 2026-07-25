'use client';

// ---------------------------------------------------------------------------
// Shipping protection toggle (Navidium) — rendered in the cart drawer between
// the line items and the footer, and on /cart under the lines. Quotes come
// from the server action (app/cart/protection.ts); the returned variant
// belongs to Navidium's own protection product and is TIERED by merchandise
// subtotal, so:
//   - the quote is re-requested whenever the merchandise lines change, and
//   - a quote is only ever USED while its key still matches the live lines
//     (a stale tier can never be added by racing the cart).
//
// The protection LINE itself never renders as a product — detection lives in
// lib/protection.ts (product handle first, name fallback), which is also what
// `enabled` reads, so the switch stays on after Shopify reconciles the line
// under Navidium's own product title ('Protected Checkout').
//
// Every addItem here is a SYSTEM add ({ open: false }): the toggle lives
// inside the drawer / on /cart already, and the tier-swap chain runs on its
// own schedule — neither may pop the drawer open or drag it back after the
// buyer has closed it.
//
// Presentation mirrors the Navidium widget format: shield mark, "Shipping
// Insurance +$X" label, and the coverage copy. While a quote is in flight the
// row renders in a loading state (price skeleton + disabled switch) so it
// pulls out WITH the drawer instead of popping in a beat later. When
// NAVIDIUM_API_URL is unset the action returns null and this renders nothing —
// the feature is invisible on stores without Navidium.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';

import { getShippingProtectionQuote } from '@/app/cart/protection';
import { merchandiseLinesOf, protectionLineOf } from '@/lib/protection';
import { formatCurrency } from '@/lib/utils';
import { useCart } from '@/store/use-cart';

interface KeyedQuote {
  /** The merchandise-lines fingerprint this quote was issued for. */
  key: string;
  variantId: string;
  price: number;
}

/** Shield-check mark (brand line style), echoing the Navidium widget glyph. */
function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ShippingProtection({ active }: { active: boolean }) {
  const { items, currencyCode, addItem, removeItem } = useCart();
  const [quote, setQuote] = useState<KeyedQuote | null>(null);
  // null = we don't know yet whether this store has Navidium (no answer yet),
  // true/false = first answer said so. While null/true and no live quote, the
  // row renders in a LOADING state (price skeleton + disabled switch) so it
  // pulls out WITH the drawer instead of popping in a beat later; once an
  // answer comes back empty (store without Navidium) the row disappears.
  const [available, setAvailable] = useState<boolean | null>(null);
  const swappingRef = useRef(false);

  const merchandiseLines = useMemo(() => merchandiseLinesOf(items), [items]);
  const protectionLine = protectionLineOf(items);

  // Fingerprint of the quote-relevant line state. A quote is valid only while
  // this matches — any add/remove/quantity change invalidates it.
  const quoteKey = useMemo(
    () => JSON.stringify(merchandiseLines.map((l) => [l.merchandiseId, l.price, l.quantity])),
    [merchandiseLines],
  );

  // Fetch a fresh quote while visible (drawer open / cart page mounted) and
  // the lines change. The action derives lines + prices from the authoritative
  // server-side cart — the client sends nothing but the request itself (the
  // browser never sends a price). The state write happens asynchronously,
  // keyed to the lines it was issued for.
  useEffect(() => {
    if (!active || merchandiseLines.length === 0) return;
    let cancelled = false;
    getShippingProtectionQuote().then((fresh) => {
      if (cancelled) return;
      setAvailable(fresh !== null);
      if (fresh) setQuote({ key: quoteKey, variantId: fresh.variantId, price: fresh.price });
    });
    return () => {
      cancelled = true;
    };
  }, [active, quoteKey, merchandiseLines]);

  // Only a quote issued for the CURRENT lines may drive the UI.
  const liveQuote = quote && quote.key === quoteKey ? quote : null;
  const enabled = protectionLine !== null;

  // Stale-tier repair: the cart total moved into another tier while protection
  // was on (e.g. quantity changed). Swap the old line for the live-tier one —
  // remove then re-add, guarded so the chain runs once per tier change.
  useEffect(() => {
    if (!liveQuote || !protectionLine || swappingRef.current) return;
    if (protectionLine.merchandiseId === liveQuote.variantId && protectionLine.price === liveQuote.price) return;
    swappingRef.current = true;
    const staleLineId = protectionLine.lineId;
    (async () => {
      await removeItem(staleLineId);
      await addItem(
        {
          merchandiseId: liveQuote.variantId,
          name: 'Shipping protection',
          price: liveQuote.price,
          variantLabel: 'OS',
          image: '',
          currencyCode,
        },
        1,
        { open: false },
      );
      swappingRef.current = false;
    })();
  }, [liveQuote, protectionLine, addItem, removeItem, currencyCode]);

  if (available === false) return null; // store without Navidium — invisible

  const loading = !liveQuote;

  const handleToggle = (checked: boolean) => {
    if (!liveQuote) return;
    if (checked) {
      addItem(
        {
          merchandiseId: liveQuote.variantId,
          name: 'Shipping protection',
          price: liveQuote.price,
          variantLabel: 'OS',
          image: '',
          currencyCode,
        },
        1,
        { open: false },
      );
    } else if (protectionLine) {
      removeItem(protectionLine.lineId);
    }
  };

  return (
    <div className="border-t border-ui-concrete/20 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-primary-cream text-primary-obsidian">
            <ShieldIcon />
          </span>
          <p className="text-sm font-bold text-primary-cream">
            Shipping Insurance{' '}
            {liveQuote ? (
              <span className="font-mono">+{formatCurrency(liveQuote.price, currencyCode)}</span>
            ) : (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-12 animate-pulse rounded-sm bg-ui-concrete/30 align-middle"
              />
            )}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle shipping protection"
          disabled={loading}
          onClick={() => handleToggle(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? 'bg-primary-cream' : 'bg-ui-concrete/40'
          } ${loading ? 'opacity-60' : ''}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 h-5 w-5 rounded-full transition-[left] ${
              enabled ? 'left-[22px] bg-primary-obsidian' : 'left-0.5 bg-primary-cream'
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ui-concrete">
        Enjoy peace of mind with 100% coverage for lost, damaged, or stolen packages.
      </p>
    </div>
  );
}
