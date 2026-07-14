'use client';

import type { DeliveryOption } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// DeliveryOptions — the shipping-method radio list for the custom checkout.
//
// Presentational + controlled: the parent (CheckoutExperience) owns the
// selected handle (it fires the `selectDeliveryOption` server action on
// change, which updates the cart + order summary). This component just renders
// the available options and reports selection changes up.
//
// Edge cases:
//   - No options (the address country has no shipping zone / inactive market):
//     show "We don&apos;t ship to {countryName} yet" and an edit-address hint.
//     Continue-to-Payment is disabled by the parent while there is no valid
//     selection — the empty state here makes the reason clear.
//   - A single option: rendered as the only radio. The parent auto-selects it
//     (persisting it via the server action) so the buyer is never blocked on a
//     no-op choice; this component just displays it pre-checked.
// ---------------------------------------------------------------------------

interface DeliveryOptionsProps {
  /** The delivery options for the primary delivery group (v1: one group only). */
  options: DeliveryOption[];
  /** The currently-selected option handle (null = none selected). */
  selectedHandle: string | null;
  /** Called when the buyer selects a different option (handle is non-empty). */
  onSelect: (handle: string) => void;
  /** Display name of the address country, for the empty-options message. */
  countryName?: string;
  /** Currency code for formatting the option `estimatedCost`. */
  currencyCode: string;
  /** Disable all radios (e.g. while a mutation is in flight). */
  disabled?: boolean;
}

export function DeliveryOptions({
  options,
  selectedHandle,
  onSelect,
  countryName,
  currencyCode,
  disabled,
}: DeliveryOptionsProps) {
  // No shipping zone / inactive market for the chosen country → Shopify returns
  // an empty deliveryOptions list (not an error). Surface it clearly.
  if (options.length === 0) {
    return (
      <div className="border border-ui-concrete/30 bg-apeiron-black p-5 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-accent-energy">
          We don&apos;t ship there yet
        </p>
        <p className="mt-2 text-xs text-ui-concrete">
          {countryName
            ? `We can&apos;t deliver to ${countryName}. Choose another address to see shipping options.`
            : 'Choose another address to see shipping options.'}
        </p>
      </div>
    );
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="sr-only">Shipping method</legend>
      {options.map((option) => {
        const checked = selectedHandle === option.handle;
        return (
          <label
            key={option.handle}
            className={cn(
              'flex items-center justify-between gap-4 border px-4 py-4 cursor-pointer transition-colors',
              checked
                ? 'border-primary-cream bg-primary-obsidian/40'
                : 'border-ui-concrete/30 hover:border-ui-concrete/60',
              disabled && 'cursor-not-allowed opacity-70',
            )}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="deliveryOption"
                value={option.handle}
                checked={checked}
                disabled={disabled}
                onChange={() => onSelect(option.handle)}
                className="h-4 w-4 accent-primary-cream"
              />
              <span className="flex flex-col">
                <span className="text-sm font-bold uppercase tracking-wider text-primary-cream">
                  {option.title ?? option.code ?? 'Shipping'}
                </span>
                {option.description ? (
                  <span className="text-xs text-ui-concrete">{option.description}</span>
                ) : null}
              </span>
            </span>
            <span className="font-mono text-sm font-bold text-primary-cream">
              {formatCurrency(option.cost.amount, currencyCode)}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}