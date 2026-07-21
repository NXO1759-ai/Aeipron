'use client';

// ---------------------------------------------------------------------------
// Shipping protection toggle (Navidium) — rendered in the cart drawer between
// the line items and the footer. Quotes come from the server action
// (app/cart/protection.ts); the returned variant belongs to Navidium's own
// protection product and is TIERED by merchandise subtotal, so:
//   - the quote is re-requested whenever the merchandise lines change, and
//   - a quote is only ever USED while its key still matches the live lines
//     (a stale tier can never be added by racing the cart).
// When NAVIDIUM_API_URL is unset the action returns null and this renders
// nothing — the feature is invisible on stores without Navidium.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';

import { getShippingProtectionQuote } from '@/app/cart/protection';
import { formatCurrency } from '@/lib/utils';
import type { CartLine } from '@/lib/types';
import { useCart } from '@/store/use-cart';

/** Navidium's line is identifiable by name only — it is their product. */
function isProtectionLine(line: CartLine): boolean {
  return line.name.toLowerCase().includes('protection');
}

interface KeyedQuote {
  /** The merchandise-lines fingerprint this quote was issued for. */
  key: string;
  variantId: string;
  price: number;
}

export function ShippingProtection() {
  const { isOpen, items, currencyCode, addItem, removeItem } = useCart();
  const [quote, setQuote] = useState<KeyedQuote | null>(null);
  const swappingRef = useRef(false);

  const merchandiseLines = useMemo(() => items.filter((l) => !isProtectionLine(l)), [items]);
  const protectionLine = items.find(isProtectionLine) ?? null;

  // Fingerprint of the quote-relevant line state. A quote is valid only while
  // this matches — any add/remove/quantity change invalidates it.
  const quoteKey = useMemo(
    () => JSON.stringify(merchandiseLines.map((l) => [l.merchandiseId, l.price, l.quantity])),
    [merchandiseLines],
  );

  // Fetch a fresh quote when the drawer is open and the lines change. The
  // state write happens asynchronously, keyed to the lines it was issued for.
  useEffect(() => {
    if (!isOpen || merchandiseLines.length === 0) return;
    let cancelled = false;
    getShippingProtectionQuote({
      lines: merchandiseLines.map((l) => ({
        merchandiseId: l.merchandiseId,
        price: l.price,
        quantity: l.quantity,
      })),
    }).then((fresh) => {
      if (!cancelled && fresh) setQuote({ key: quoteKey, variantId: fresh.variantId, price: fresh.price });
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, quoteKey, merchandiseLines]);

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
      await addItem({
        merchandiseId: liveQuote.variantId,
        name: 'Shipping protection',
        price: liveQuote.price,
        variantLabel: 'OS',
        image: '',
        currencyCode,
      });
      swappingRef.current = false;
    })();
  }, [liveQuote, protectionLine, addItem, removeItem, currencyCode]);

  if (!liveQuote) return null;

  const handleToggle = (checked: boolean) => {
    if (checked) {
      addItem({
        merchandiseId: liveQuote.variantId,
        name: 'Shipping protection',
        price: liveQuote.price,
        variantLabel: 'OS',
        image: '',
        currencyCode,
      });
    } else if (protectionLine) {
      removeItem(protectionLine.lineId);
    }
  };

  return (
    <div className="border-t border-ui-concrete/20 px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-primary-cream">
            Shipping protection
          </p>
          <p className="mt-1 text-xs text-ui-concrete">
            Covers loss, theft &amp; damage —{' '}
            <span className="font-mono text-primary-cream">{formatCurrency(liveQuote.price, currencyCode)}</span>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle shipping protection"
          onClick={() => handleToggle(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? 'bg-primary-cream' : 'bg-ui-concrete/40'
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 h-5 w-5 rounded-full transition-[left] ${
              enabled ? 'left-[22px] bg-primary-obsidian' : 'left-0.5 bg-primary-cream'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
