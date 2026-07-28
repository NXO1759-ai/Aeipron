'use client';

// ---------------------------------------------------------------------------
// SizeSelector — the "sliding marker" size picker for the PDP.
//
// A row of size pills above a ruler-style tick track; a small triangular
// marker glides along the track and centres itself under the selected size.
// Sold-out sizes get a diagonal strike-through, are announced as
// "{size}, sold out", and are skipped by keyboard navigation.
//
// Accessibility (ARIA radiogroup pattern):
//   · role="radiogroup" + role="radio" with aria-checked
//   · roving tabindex — one Tab stop, arrows move between sizes
//   · Arrow keys wrap around both ends and SKIP sold-out sizes
//   · Home / End jump to the first / last enabled size
//   · sold-out pills are aria-disabled (focusable skip, never selectable)
//
// Motion discipline: transform/opacity only — the marker is a compositor-only
// translateX with easeOutQuint cubic-bezier(0.22, 1, 0.36, 1); measurement is
// a single batched layout read per change (offsetLeft + offsetWidth), and a
// ResizeObserver re-measures on viewport / orientation changes. Under
// prefers-reduced-motion the marker snaps instantly. NO haptics, vibration,
// or sound anywhere (no Vibration API, no AudioContext) — the spec forbids
// them.
//
// Readout: the "CHEST … · LENGTH …" numbers tween in HALF-INCH steps (the
// house block grades in halves — 23 → 23½ → 24) and settle on the exact
// size-guide values, formatted with the ½ glyph like the guide tables.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  firstEnabledIndex,
  lastEnabledIndex,
  nextEnabledIndex,
} from '@/lib/size-selector';
import { formatMeasurementValue } from '@/lib/size-measurements';
import type { SizeMeasurement } from '@/lib/size-measurements';
import { useTweenedNumber } from '@/hooks/use-tweened-number';

export type SizeSelectorProps = {
  /** All sizes, in display order. */
  sizes: string[];
  /** Sizes that cannot be selected (strike-through, skipped by keyboard). */
  soldOut?: string[];
  /** Initially selected size (ignored when it is sold out). */
  defaultSize?: string;
  /** Accessible name for the radiogroup — matches the visible PDP header
   * ("Select Size", "Select Length", …). */
  label?: string;
  /** Per-size garment measurements, aligned with `sizes` (from the product's
   * size_measurements metafield via lib/size-measurements). When provided, a
   * "CHEST n UNIT · LENGTH n UNIT" readout renders under the ruler track and
   * follows the selection with a number tween; absent → no readout. */
  measurements?: readonly (SizeMeasurement | undefined)[];
  /** Display unit for the readout ("IN" / "CM") — shown uppercased. */
  measurementUnit?: string;
  /** Fires only when the selection actually changes. */
  onChange?: (size: string) => void;
};

/** Half the marker's rendered width (the border-trick triangle is 10px across). */
const MARKER_HALF_WIDTH = 5;

/** The house block grades in half inches, so the readout tweens in halves. */
const MEASUREMENT_TWEEN_STEP = 0.5;

// SSR-safe layout effect: useLayoutEffect warns when run on the server.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function SizeSelector({
  sizes,
  soldOut = [],
  defaultSize,
  label = 'Select size',
  measurements,
  measurementUnit = 'IN',
  onChange,
}: SizeSelectorProps) {
  const soldOutSet = new Set(soldOut);
  const [selected, setSelected] = useState<string | null>(
    defaultSize && !soldOutSet.has(defaultSize) ? defaultSize : null,
  );
  const [markerX, setMarkerX] = useState(0);
  // Gates the marker's transition: it must appear in place, never slide in
  // from the left edge on mount.
  const [markerReady, setMarkerReady] = useState(false);

  const rowRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // One batched layout read per change: centre the marker under the pill.
  // The pills row is `relative`, so offsetLeft shares the track's origin.
  const measure = useCallback((index: number) => {
    const pill = pillRefs.current[index];
    if (!pill) return;
    setMarkerX(pill.offsetLeft + pill.offsetWidth / 2 - MARKER_HALF_WIDTH);
  }, []);

  const selectedIndex = selected === null ? -1 : sizes.indexOf(selected);
  // Roving tabindex: the selected pill is the Tab stop; with no selection the
  // first enabled size takes it. Sold-out pills stay reachable via arrows but
  // out of the Tab order unless they hold the stop.
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(sizes, soldOut);

  // Measurement readout (rendered only when the product supplies per-size
  // data): the visible numbers tween with the same easing as the marker, so
  // the whole instrument glides together; AT gets a separate live region that
  // announces only the SETTLED value, never the intermediate tween frames.
  const activeMeasurement =
    measurements && selectedIndex >= 0 ? measurements[selectedIndex] : undefined;
  const chestDisplay = useTweenedNumber(activeMeasurement?.chest ?? null, 300, MEASUREMENT_TWEEN_STEP);
  const lengthDisplay = useTweenedNumber(activeMeasurement?.length ?? null, 300, MEASUREMENT_TWEEN_STEP);
  const unit = measurementUnit.toUpperCase();

  // Measure after every selection change (layout effect → no visible jump)…
  useIsomorphicLayoutEffect(() => {
    if (selectedIndex >= 0) measure(selectedIndex);
  }, [selectedIndex, measure]);

  // …then arm the transition on the next frame, so the marker fades in
  // already centred instead of gliding from 0.
  useEffect(() => {
    if (selectedIndex < 0) return;
    const frame = requestAnimationFrame(() => setMarkerReady(true));
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);

  // Re-measure when the row resizes (viewport, orientation, late fonts).
  useEffect(() => {
    const row = rowRef.current;
    if (!row || selectedIndex < 0) return;
    const observer = new ResizeObserver(() => measure(selectedIndex));
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, selectedIndex]);

  const select = (size: string, moveFocus = false) => {
    const index = sizes.indexOf(size);
    if (index === -1 || soldOutSet.has(size)) return; // sold-out is inert
    if (size !== selected) {
      setSelected(size);
      onChange?.(size);
    }
    if (moveFocus) pillRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next = -1;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = nextEnabledIndex(sizes, soldOut, selectedIndex, +1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = nextEnabledIndex(sizes, soldOut, selectedIndex, -1);
        break;
      case 'Home':
        next = firstEnabledIndex(sizes, soldOut);
        break;
      case 'End':
        next = lastEnabledIndex(sizes, soldOut);
        break;
      default:
        return; // let every other key behave natively
    }
    event.preventDefault();
    if (next >= 0) select(sizes[next], true);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="size-selector w-full select-none bg-transparent"
      onKeyDown={onKeyDown}
    >
      <div ref={rowRef} className="relative flex w-full gap-2">
        {sizes.map((size, index) => {
          const isSoldOut = soldOutSet.has(size);
          const isSelected = size === selected;
          return (
            <button
              key={size}
              ref={(element) => {
                pillRefs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isSoldOut || undefined}
              aria-label={isSoldOut ? `${size}, sold out` : undefined}
              tabIndex={index === tabbableIndex ? 0 : -1}
              onClick={() => select(size)}
              className={[
                'size-selector__pill flex-1 px-2 py-3 text-xs tracking-[0.2em] uppercase',
                isSelected ? 'size-selector__pill--selected' : '',
                isSoldOut ? 'size-selector__pill--sold-out' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {size}
            </button>
          );
        })}
      </div>

      {/* Ruler track + sliding marker — decorative, hidden from AT. */}
      <div aria-hidden="true" className="size-selector__track relative mt-6 w-full">
        <div
          className={`size-selector__marker absolute bottom-0 left-0${
            markerReady ? '' : ' size-selector__marker--idle'
          }`}
          style={{ transform: `translateX(${markerX}px)` }}
        />
      </div>

      {/* Garment measurements for the selected size (per-product metafield
          data, or the house size block when absent). Always rendered when
          data exists so the layout never shifts on first selection;
          placeholders sit in until a size is picked. Values format like the
          size guide tables: whole inches plain, halves with the ½ glyph. */}
      {measurements ? (
        <p className="mt-8 text-center font-mono text-xs uppercase tracking-[0.3em] text-ui-concrete">
          <span className="sr-only" aria-live="polite">
            {activeMeasurement
              ? `Chest ${activeMeasurement.chest} ${unit}, length ${activeMeasurement.length} ${unit}`
              : ''}
          </span>
          <span aria-hidden="true">
            Chest{' '}
            <span className="tabular-nums">
              {chestDisplay != null ? formatMeasurementValue(chestDisplay) : '—'}
            </span>{' '}
            {unit}
            {'  ·  '}
            Length{' '}
            <span className="tabular-nums">
              {lengthDisplay != null ? formatMeasurementValue(lengthDisplay) : '—'}
            </span>{' '}
            {unit}
          </span>
        </p>
      ) : null}
    </div>
  );
}
