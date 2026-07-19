'use client';

import { ShieldCheck, Loader2 } from 'lucide-react';
import { useCart, isProtectionLine } from '@/store/use-cart';
import { computeProtectionOffering } from '@/lib/shipping-protection/ladder';
import { formatCurrency } from '@/lib/utils';

// ---------------------------------------------------------------------------
// ShippingProtectionToggle — the Captain shipping-protection opt-in SWITCH.
//
// Protection is represented by THIS toggle only — never as a cart row. The
// protection line is filtered out of the cart list (see CartDrawer / CartView)
// and excluded from the bag badge (selectMerchandiseCount), so the cart shows
// real products + this switch, and the badge counts products only.
//
// The switch reflects the live cart state: ON (knob right + pink) when a
// protection line is in the cart, OFF (knob left) otherwise. Clicking flips it
// — ON adds the correct price-laddered variant (qty 1) via the store; OFF
// removes it. The browser never picks a variant id or sends a price; the
// variant is resolved here from the server-shipped config + the cart subtotal
// via the shared pure resolver. Disabled + spinner while a mutation is pending.
//
// Renders NOTHING when protection is unavailable (no server-shipped variant
// grid, an empty cart, or no resolvable tier) — graceful degrade.
//
// SWITCH MARKUP NOTE: the track + knob are SIBLINGS of the hidden checkbox
// (peer) inside a relative wrapper, not nested — `peer-checked:translate-x-*`
// compiles to a general-sibling combinator (`~`) and only reaches siblings. An
// earlier version nested the knob inside the track, so the track's color
// changed (sibling) but the knob never slid (child). Now both are siblings.
//
// The tier-cross reconcile lives in ProtectionHydrator (always mounted), not
// here, so it keeps running regardless of this toggle's render state.
// ---------------------------------------------------------------------------

export function ShippingProtectionToggle() {
  const items = useCart((s) => s.items);
  const variants = useCart((s) => s.protectionVariants);
  const rate = useCart((s) => s.protectionRate);
  const currencyCode = useCart((s) => s.currencyCode);
  const status = useCart((s) => s.status);
  const toggle = useCart((s) => s.toggleShippingProtection);

  // No config → protection product not visible to the Storefront API: render
  // nothing. An empty cart has nothing to protect either.
  if (variants.length === 0 || items.length === 0) return null;

  const offering = computeProtectionOffering(items, variants, rate);
  if (!offering) return null; // no grid tiers → can't resolve a fee

  // `checked` includes a provisional (tmp-protection-) line so the switch flips
  // ON the instant the buyer clicks (optimistic), matching the rest of the
  // cart's optimistic UX. If the add fails the store rolls the provisional line
  // back and `checked` returns to false.
  const checked = items.some((i) => isProtectionLine(i, variants));
  const pending = status === 'pending';
  const feeLabel = formatCurrency(offering.fee, currencyCode);

  return (
    <div className="mb-6 border border-ui-concrete/20 p-4">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        {/* Relative wrapper so the track + knob can be siblings of the peer input. */}
        <span className="relative mt-0.5 inline-block h-6 w-11 shrink-0">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={checked}
            disabled={pending}
            onChange={(e) => void toggle(e.target.checked)}
            aria-label={`${checked ? 'Remove' : 'Add'} shipping protection for ${feeLabel}`}
          />
          {/* Track (sibling of input → peer-checked works). */}
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-ui-concrete/40 bg-primary-obsidian transition-colors peer-checked:border-accent-energy peer-checked:bg-accent-energy peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
          />
          {/* Knob (sibling of input → peer-checked:translate-x works). */}
          <span
            aria-hidden="true"
            className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-primary-cream transition-transform peer-checked:translate-x-5"
          />
        </span>

        <span className="flex-1">
          <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary-cream">
            <ShieldCheck className="h-4 w-4 text-accent-energy" aria-hidden="true" />
            {checked ? 'Shipping protection' : 'Add shipping protection'}
            <span className="font-mono normal-case tracking-normal text-ui-concrete">
              +{feeLabel}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-ui-concrete">
            Cover loss, theft, and damage in transit. Added at checkout by Captain.
          </span>
        </span>

        {pending ? (
          <Loader2
            className="mt-1 h-4 w-4 shrink-0 animate-spin text-ui-concrete"
            aria-hidden="true"
          />
        ) : null}
      </label>
    </div>
  );
}