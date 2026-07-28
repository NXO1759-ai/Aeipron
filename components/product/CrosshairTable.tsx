'use client';

// ---------------------------------------------------------------------------
// CrosshairTable — wraps a data table with an animated crosshair: a
// horizontal and a vertical translucent band that glide to the row and
// column of the cell under the pointer (or the last tapped cell on touch),
// so shoppers can trace a measurement across a row and down a column
// without losing their place — the classic spreadsheet crosshair, branded.
//
// Feel: transform/opacity only (compositor), house easing
// cubic-bezier(0.22, 1, 0.36, 1) over 200ms; the bands fade out when the
// pointer leaves the table. The two bands overlap at the aimed cell, so the
// intersection reads brighter — the crosshair's natural focal point. Under
// prefers-reduced-motion the bands snap instantly (no glide).
//
// Performance: one batched layout read per cell change (row offsetTop/
// offsetHeight, cell offsetLeft/offsetWidth — all relative to the
// positioned inner wrapper) written straight to the bands' style — no
// React re-render on pointer move.
//
// Scroll: the bands live INSIDE the overflow-x-auto container and span the
// table's full width/height (the inner wrapper sizes to the table via
// w-max + min-w-full), so horizontal scrolling on narrow screens carries
// the crosshair along with the table. Decorative — aria-hidden, table
// semantics and accessibility untouched.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import type { MouseEvent } from 'react';

const BAND_CLASSES =
  'pointer-events-none absolute opacity-0 bg-primary-cream/[0.06] ' +
  'transition-[transform,opacity] duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ' +
  'motion-reduce:transition-none';

export function CrosshairTable({ children }: { children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const rowBandRef = useRef<HTMLDivElement | null>(null);
  const colBandRef = useRef<HTMLDivElement | null>(null);
  const lastCellRef = useRef<HTMLElement | null>(null);

  const aimAt = (cell: HTMLElement) => {
    if (cell === lastCellRef.current) return;
    lastCellRef.current = cell;
    const row = cell.parentElement; // <tr>
    const rowBand = rowBandRef.current;
    const colBand = colBandRef.current;
    if (!row || !rowBand || !colBand) return;

    // One batched read block…
    const rowTop = row.offsetTop;
    const rowHeight = row.offsetHeight;
    const colLeft = cell.offsetLeft;
    const colWidth = cell.offsetWidth;

    // …then one write block — no interleaved layout thrash.
    rowBand.style.height = `${rowHeight}px`;
    rowBand.style.transform = `translateY(${rowTop}px)`;
    rowBand.style.opacity = '1';
    colBand.style.width = `${colWidth}px`;
    colBand.style.transform = `translateX(${colLeft}px)`;
    colBand.style.opacity = '1';
  };

  const dismiss = () => {
    lastCellRef.current = null;
    if (rowBandRef.current) rowBandRef.current.style.opacity = '0';
    if (colBandRef.current) colBandRef.current.style.opacity = '0';
  };

  const cellFromEvent = (event: MouseEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest('td, th') as HTMLElement | null;
    return cell && innerRef.current?.contains(cell) ? cell : null;
  };

  return (
    <div className="overflow-x-auto">
      <div
        ref={innerRef}
        className="relative w-max min-w-full"
        onMouseOver={(event) => {
          const cell = cellFromEvent(event);
          if (cell) aimAt(cell);
        }}
        onMouseLeave={dismiss}
        onClick={(event) => {
          // Touch devices have no hover — tap a cell to pin the crosshair.
          const cell = cellFromEvent(event);
          if (cell) aimAt(cell);
        }}
      >
        {children}
        {/* Row band — spans the table's full width, glides vertically. */}
        <div aria-hidden="true" ref={rowBandRef} className={`${BAND_CLASSES} left-0 right-0 top-0`} />
        {/* Column band — spans the table's full height, glides horizontally. */}
        <div aria-hidden="true" ref={colBandRef} className={`${BAND_CLASSES} left-0 top-0 bottom-0`} />
      </div>
    </div>
  );
}
