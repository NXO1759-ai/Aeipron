'use client';

// ---------------------------------------------------------------------------
// SizeGuide — the structured body of the "Product Sizing" dropdown on the
// PDP (app/product/[slug]/ProductExperience.tsx). Content placement per the
// client's corrected spec:
//
//   PRODUCT SIZING DROPDOWN shows the garment-spec block:
//     · "Find Your Size — Body Measurements" heading + the 8–12" ease line
//     · the garment grid (S–XXL: body length HPS, chest pit-to-pit, chest
//       full circumference, sleeve length from shoulder)
//     · "All measurements in inches."
//
//   "How To Measure" button (each word capitalized) opens a MODAL with:
//     · the body-chest table (SIZE → chest IN / CM / US alpha / EU equivalent)
//     · How We Measure — the three measurement definitions
//     · Fit Notes — the four fit recommendations
//
//   All copy lives in lib/size-guide.ts (transcribed verbatim from the
//   brand's size document).
//
// TABLES: every table sits inside its OWN overflow-x-auto wrapper, so on a
// screen too narrow to show every column, the table — and only the table —
// scrolls horizontally; the surrounding text never moves. The min-w on each
// table is what engages the scroll on small screens; above it the table just
// fills its column.
//
// The modal is a lightweight accessible dialog, no library: role="dialog" +
// aria-modal, Escape closes, the backdrop is a real <button> (keyboard-
// reachable, closes on click), body scroll locks while open, and focus lands
// on the close button when it opens. Rendered fixed-position inline (no
// portal) — no ancestor here clips fixed positioning.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  BODY_MEASUREMENT_ROWS,
  FIT_NOTES,
  GARMENT_MEASUREMENT_ROWS,
  GARMENT_MEASUREMENT_UNIT_NOTE,
  GARMENT_SIZES,
  HOW_WE_MEASURE,
} from '@/lib/size-guide';

const HEADING_CLASSES = 'text-xs font-bold uppercase tracking-widest text-primary-cream';
const TABLE_HEAD_CELL =
  'border-b border-ui-concrete/20 py-2 pr-4 text-[10px] font-bold uppercase tracking-[0.2em] text-ui-concrete';
const TABLE_BODY_CELL =
  'border-b border-ui-concrete/10 py-2.5 pr-4 font-mono text-sm tabular-nums text-primary-cream/90';

export function SizeGuide() {
  const [modalOpen, setModalOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // While the modal is open: lock body scroll, close on Escape, and move
  // focus to the close button so keyboard / AT users land inside the dialog.
  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [modalOpen]);

  return (
    <div>
      {/* Product Sizing dropdown body — the garment-spec block */}
      <h3 className={HEADING_CLASSES}>Find Your Size — Body Measurements</h3>
      <p className="mt-2 mb-6 text-sm text-ui-concrete">
        Choose by your body chest. This block builds in roughly 8–12&quot; of ease for the
        intended relaxed drape.
      </p>

      {/* Garment grid — in its own horizontal-scroll wrapper so only the
          table scrolls on narrow screens. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className={TABLE_HEAD_CELL}>Size</th>
              {GARMENT_SIZES.map((size) => (
                <th key={size} scope="col" className={TABLE_HEAD_CELL}>
                  {size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GARMENT_MEASUREMENT_ROWS.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-ui-concrete/10 py-2.5 pr-6 text-[10px] font-bold uppercase tracking-[0.15em] text-ui-concrete"
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={GARMENT_SIZES[index]} className={TABLE_BODY_CELL}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ui-concrete">{GARMENT_MEASUREMENT_UNIT_NOTE}</p>

      {/* How To Measure → body-measurements + fit-notes modal */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="mt-6 cursor-pointer text-xs font-bold uppercase tracking-widest text-primary-cream underline underline-offset-4 transition-colors hover:text-accent-energy active:text-accent-energy"
      >
        How To Measure
      </button>

      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How To Measure"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        >
          {/* Backdrop — a real button: keyboard-reachable, closes on click. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 cursor-pointer bg-apeiron-black/70 backdrop-blur-sm"
          />
          <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-ui-concrete/20 bg-primary-obsidian p-6 md:p-10">
            <div className="mb-6 flex items-start justify-between gap-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary-cream">
                How To Measure
              </h3>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close"
                onClick={() => setModalOpen(false)}
                className="cursor-pointer text-ui-concrete transition-colors hover:text-primary-cream"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Body-chest table — its own horizontal-scroll wrapper */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-left">
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD_CELL}>Size</th>
                    <th scope="col" className={TABLE_HEAD_CELL}>Body chest (in)</th>
                    <th scope="col" className={TABLE_HEAD_CELL}>Body chest (cm)</th>
                    <th scope="col" className={TABLE_HEAD_CELL}>US Alpha</th>
                    <th scope="col" className={TABLE_HEAD_CELL}>EU equivalent</th>
                  </tr>
                </thead>
                <tbody>
                  {BODY_MEASUREMENT_ROWS.map((row) => (
                    <tr key={row.size}>
                      <th
                        scope="row"
                        className="border-b border-ui-concrete/10 py-2.5 pr-4 text-sm font-bold text-primary-cream"
                      >
                        {row.size}
                      </th>
                      <td className={TABLE_BODY_CELL}>{row.chestIn}</td>
                      <td className={TABLE_BODY_CELL}>{row.chestCm}</td>
                      <td className={TABLE_BODY_CELL}>{row.usAlpha}</td>
                      <td className={TABLE_BODY_CELL}>{row.euEquivalent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* How We Measure */}
            <h3 className={`${HEADING_CLASSES} mt-8 mb-3`}>How We Measure</h3>
            <ul className="list-disc space-y-2 pl-5 text-sm text-ui-concrete">
              {HOW_WE_MEASURE.map((item) => (
                <li key={item.term}>
                  <strong className="font-bold text-primary-cream">{item.term}:</strong>{' '}
                  {item.description}
                </li>
              ))}
            </ul>

            {/* Fit Notes */}
            <h3 className={`${HEADING_CLASSES} mt-8 mb-3`}>Fit Notes</h3>
            <ul className="list-disc space-y-2 pl-5 text-sm text-ui-concrete">
              {FIT_NOTES.map((note) => (
                <li key={note.lead}>
                  <strong className="font-bold text-primary-cream">{note.lead}</strong> {note.body}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
