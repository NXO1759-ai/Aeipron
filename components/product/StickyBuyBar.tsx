'use client';

// ---------------------------------------------------------------------------
// StickyBuyBar — mobile-only thumb-zone buy action for the PDP.
//
// Fixed to the bottom edge of the viewport (where the thumb actually reaches),
// it mirrors the inline Add-to-bag button: the SELECTED SIZE (when the product
// has a size group), the LIVE price, and the same add action + disabled state.
// The parent (ProductExperience) drives `visible` via an IntersectionObserver
// on the inline button — the bar slides up only when the inline button is
// scrolled out of view, so the two never duplicate on screen.
//
// Motion + a11y follow the storefront's discipline: compositor-only transform
// (motion-safe gated — reduced-motion users get an instant jump), inert +
// aria-hidden while hidden so the off-screen button can't receive focus, and
// safe-area padding so the iPhone home indicator never covers the button.
// Desktop (lg+) never shows it — the buybox is sticky there already.
// ---------------------------------------------------------------------------

type StickyBuyBarProps = {
  /** Whether the bar is on screen (parent observes the inline button). */
  visible: boolean;
  /** The selected size-group value (e.g. "M"), or null when nothing is
   * selected yet (renders an em dash placeholder). */
  sizeLabel: string | null;
  /** Whether the product has a size option group at all — the size slot is
   * omitted for size-less products (e.g. accessories). */
  hasSizeGroup: boolean;
  /** Live price label (the selected variant's price, or the product range). */
  priceLabel: string;
  /** True once a valid, in-stock variant is fully selected. */
  canAdd: boolean;
  /** The PDP's add-to-bag handler (shared with the inline button). */
  onAdd: () => void;
};

export function StickyBuyBar({
  visible,
  sizeLabel,
  hasSizeGroup,
  priceLabel,
  canAdd,
  onAdd,
}: StickyBuyBarProps) {
  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-ui-concrete/20 bg-primary-obsidian lg:hidden motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="flex items-center gap-4 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {hasSizeGroup ? (
          <span className="min-w-8 text-center text-sm font-bold uppercase tracking-widest">
            {sizeLabel ?? '—'}
          </span>
        ) : null}
        <span className="font-mono text-sm text-ui-concrete">{priceLabel}</span>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className={`flex-1 py-4 uppercase tracking-widest font-bold text-sm transition-colors ${
            canAdd
              ? 'bg-apeiron-ivory text-apeiron-black active:opacity-80 cursor-pointer'
              : 'bg-ui-concrete/20 text-ui-concrete cursor-not-allowed'
          }`}
        >
          {canAdd ? 'Add to bag' : 'Select an option'}
        </button>
      </div>
    </div>
  );
}
