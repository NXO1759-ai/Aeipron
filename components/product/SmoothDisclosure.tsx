'use client';

import { createContext, useCallback, useContext, useId, useState } from 'react';

// ---------------------------------------------------------------------------
// SmoothDisclosure — the accordion row used on the PDP (Details & Fabrication,
// Product Care, Product Sizing, Reviews) and the Help Center.
//
// The open/close motion runs on the compositor like the cart drawer: the body
// is a CSS grid whose rows animate 0fr → 1fr, plus an opacity fade — no layout
// thrash, no animation library, no jump when the content is taller than the
// viewport. Unlike native <details>, closing animates too.
//
// ACCENT: no persistent accent while open — the energy accent is transient
// feedback only: hover on pointer devices, `active:` (the touch accent) while
// a finger/stylus presses.
//
// ACCORDION: wrap siblings in <DisclosureGroup> and only ONE row stays open at
// a time — opening another smoothly retracts the previous one. Used
// standalone (no group), each row keeps its own independent state.
//
// Accessibility: a real <button> with aria-expanded/aria-controls; the body
// is inert while closed so its links can't receive keyboard focus inside a
// collapsed row.
// ---------------------------------------------------------------------------

const DisclosureGroupContext = createContext<{
  openId: string | null;
  toggle: (id: string) => void;
} | null>(null);

/** Groups SmoothDisclosure rows into a single-open accordion. */
export function DisclosureGroup({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = useCallback((id: string) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);
  return (
    <DisclosureGroupContext.Provider value={{ openId, toggle }}>
      {children}
    </DisclosureGroupContext.Provider>
  );
}

type SmoothDisclosureProps = {
  /** The summary line, rendered uppercase + bold. */
  summary: string;
  /** The expanded content. */
  children: React.ReactNode;
};

export function SmoothDisclosure({ summary, children }: SmoothDisclosureProps) {
  const group = useContext(DisclosureGroupContext);
  const id = useId();
  const [openLocal, setOpenLocal] = useState(false);
  const open = group ? group.openId === id : openLocal;
  const bodyId = useId();

  const handleToggle = () => {
    if (group) group.toggle(id);
    else setOpenLocal((prev) => !prev);
  };

  return (
    <div className="border-b border-ui-concrete/20 pb-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={handleToggle}
        className="flex w-full cursor-pointer items-center justify-between text-left text-sm font-bold uppercase tracking-widest transition-colors hover:text-accent-energy active:text-accent-energy"
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
