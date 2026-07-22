'use client';

import { useId, useState } from 'react';

// ---------------------------------------------------------------------------
// SmoothDisclosure — the PDP accordion row (Details & Fabrication, Product
// Care, Product Sizing, Reviews).
//
// Same visual language as the native <details> pattern it replaces (uppercase
// tracking-widest bold summary, `+` glyph rotating to `×`, ui-concrete/20
// bottom border), but the open/close motion runs on the compositor like the
// cart drawer: the body is a CSS grid whose rows animate 0fr → 1fr, plus an
// opacity fade — no layout thrash, no animation library, no jump when the
// content is taller than the viewport.
//
// Accessibility: a real <button> with aria-expanded/aria-controls; the body
// is inert while closed so its links can't receive keyboard focus inside a
// collapsed row.
// ---------------------------------------------------------------------------

type SmoothDisclosureProps = {
  /** The summary line, rendered uppercase + bold. */
  summary: string;
  /** The expanded content. */
  children: React.ReactNode;
};

export function SmoothDisclosure({ summary, children }: SmoothDisclosureProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className="border-b border-ui-concrete/20 pb-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full cursor-pointer items-center justify-between text-left text-sm font-bold uppercase tracking-widest transition-colors hover:text-accent-energy ${
          open ? 'text-accent-energy' : ''
        }`}
      >
        {summary}
        <span
          aria-hidden="true"
          className={`text-ui-concrete transition-transform duration-300 ${open ? 'rotate-45' : ''}`}
        >
          +
        </span>
      </button>
      <div
        id={bodyId}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-2 text-sm text-ui-concrete">{children}</div>
        </div>
      </div>
    </div>
  );
}
