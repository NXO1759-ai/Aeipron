// ---------------------------------------------------------------------------
// Disclosure — a reusable, keyboard + touch accessible accordion built on the
// native <details>/<summary> elements (no JS, works without a client island).
//
// Styling matches the inline disclosure convention already used on the product
// page (app/product/[slug]/ProductExperience.tsx): uppercase tracking-widest
// bold summary, a `+` glyph that rotates to `×` when open, a ui-concrete/20
// bottom border. Establishing it here as a shared primitive lets new content
// pages (Help/FAQ) reuse the same look without duplicating the markup; the
// product page is NOT refactored this phase (out of scope).
//
// Plain Server Component (no 'use client'): native disclosure needs no JS.
// ---------------------------------------------------------------------------

type DisclosureProps = {
  /** The summary line, rendered uppercase + bold. */
  summary: string;
  /** The expanded content. */
  children: React.ReactNode;
};

export function Disclosure({ summary, children }: DisclosureProps) {
  return (
    <details className="border-b border-ui-concrete/20 pb-6 group">
      <summary className="uppercase tracking-widest font-bold text-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between hover:text-accent-energy transition-colors">
        {summary}
        <span className="text-ui-concrete transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="text-sm text-ui-concrete mt-2">{children}</div>
    </details>
  );
}