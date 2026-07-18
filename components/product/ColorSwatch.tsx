'use client';

// ---------------------------------------------------------------------------
// ColorSwatch / ColorSwatchGroup — visual color picker for the product page.
//
// Replaces the generic text-button option picker for the Color group: each
// value renders as a round color checkpoint (a dot filled with the resolved
// color, or a texture/pattern image) the buyer taps, with a live readout of
// the selected color name. Non-color groups (Size, etc.) keep the existing
// text buttons — see app/product/[slug]/ProductExperience.tsx.
//
// Color resolution is layered (lib/color.ts → resolveSwatch): a merchant-
// configured Shopify swatch (hex or image) wins; otherwise a built-in
// name→hex resolver + a deterministic hash fallback so ANY color renders, with
// or without Shopify Admin swatch setup.
//
// Selection contract is identical to the text buttons: a tap calls
// onSelect(value), which sets selections[name] in ProductExperience; the
// existing resolveSelectedVariant / resolvePreviewVariant resolve the exact
// variant (gallery image + cart merchandiseId). No cart/checkout changes.
//
// Memoization: ColorSwatch is React.memo'd and receives a stable onSelect
// (a per-group useCallback in ColorSwatchGroup), so a color tap only
// re-renders the two swatches whose `selected` prop flips — not the whole row.
// ---------------------------------------------------------------------------

import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { resolveSwatch } from '@/lib/color';
import type { ProductOption } from '@/lib/types';

/** Option-group names treated as colors (case-insensitive). Sourced from the
 * Shopify `Color` option by convention; matched loosely so a merchant who
 * names the group "Colour" still gets swatches. */
const COLOR_GROUP_NAMES = new Set(['color', 'colour']);

/** True when an option group should render as color swatches (by name). */
export function isColorGroup(name: string): boolean {
  return COLOR_GROUP_NAMES.has(name.trim().toLowerCase());
}

interface ColorSwatchProps {
  value: string;
  colorHex?: string;
  swatchImage?: string;
  inStock: boolean;
  selected: boolean;
  onSelect: (value: string) => void;
}

/** A single color checkpoint — a round dot, filled with the resolved color.
 * Memoized so only the swatches whose props change re-render on a selection. */
const ColorSwatch = memo(function ColorSwatch({
  value,
  colorHex,
  swatchImage,
  inStock,
  selected,
  onSelect,
}: ColorSwatchProps) {
  const swatch = resolveSwatch(value, colorHex, swatchImage);

  // Inline fill: a texture/pattern image renders as a background image; a flat
  // color renders as backgroundColor. Using inline styles (not Tailwind
  // classes) because the color is dynamic per value.
  const fillStyle =
    swatch.kind === 'image'
      ? { backgroundImage: `url("${swatch.url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: swatch.hex };

  return (
    <button
      type="button"
      disabled={!inStock}
      aria-pressed={selected}
      aria-label={`Color ${value}${!inStock ? ', out of stock' : ''}`}
      onClick={() => onSelect(value)}
      title={value}
      className={cn(
        'relative h-11 w-11 rounded-full overflow-hidden transition-shadow motion-reduce:transition-none',
        // Base ring at /50 (matches the Size text buttons' border opacity) so
        // even a near-black swatch reads against the dark page bg.
        'ring-1 ring-primary-cream/50',
        inStock && !selected && 'hover:ring-2 hover:ring-primary-cream/60 cursor-pointer',
        // Selected: a 2px accent-energy ring with NO ring-offset — the offset
        // would paint an opaque gap that visually shrinks the dot on selection
        // (jank). The ring is box-shadow, so it never reflows neighbors.
        selected && 'ring-2 ring-accent-energy',
        !inStock && 'opacity-40 cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-energy',
      )}
      style={fillStyle}
    >
      {!inStock && (
        // Diagonal strike-through for out-of-stock colors — same visual
        // language as the OOS text buttons in ProductExperience.
        <span
          className="absolute top-1/2 left-0 w-full h-[1px] bg-ui-concrete/70 transform -translate-y-1/2 -rotate-45"
          aria-hidden="true"
        />
      )}
      {/* Visually-hidden label for AT users: the dot carries the color, the
          name is announced via aria-label above. */}
      <span className="sr-only">{value}</span>
    </button>
  );
});

interface ColorSwatchGroupProps {
  group: ProductOption;
  /** Called with the option NAME + the chosen value. Stable from the parent
   * (useCallback in ProductExperience) so this group can memo its own handler. */
  onSelect: (name: string, value: string) => void;
  selectedValue?: string;
}

/**
 * The color picker for one option group: the eyebrow + live selected-name
 * readout (aria-live, so AT announces the color change), then the row of color
 * checkpoints. Drops to a second line on mobile for products with many colors
 * (flex-wrap, same gap as text buttons).
 *
 * Memoized: re-renders when `selectedValue` changes, but the memoized
 * ColorSwatch children only re-render when their own `selected` flips.
 */
export const ColorSwatchGroup = memo(function ColorSwatchGroup({
  group,
  onSelect,
  selectedValue,
}: ColorSwatchGroupProps) {
  // Bind the option name once (stable while group.name + onSelect are stable)
  // so every ColorSwatch receives the same onSelect identity across renders.
  const handleSelect = useCallback(
    (value: string) => onSelect(group.name, value),
    [onSelect, group.name],
  );

  return (
    <div className="mb-10">
      <div className="mb-6 flex justify-between items-end">
        <span className="uppercase tracking-widest text-sm font-bold" aria-live="polite">
          Select {group.name}
          {selectedValue ? (
            <span className="ml-2 normal-case tracking-normal text-ui-concrete font-normal">— {selectedValue}</span>
          ) : null}
        </span>
      </div>

      <div className="flex flex-wrap gap-3" role="group" aria-label={`${group.name} options`}>
        {group.values.map((v) => (
          <ColorSwatch
            key={v.value}
            value={v.value}
            colorHex={v.colorHex}
            swatchImage={v.swatchImage}
            inStock={v.inStock}
            selected={selectedValue === v.value}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
});