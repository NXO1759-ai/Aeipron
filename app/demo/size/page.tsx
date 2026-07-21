'use client';

// ---------------------------------------------------------------------------
// /demo/size — isolated playground for the sliding-marker SizeSelector
// (components/SizeSelector.tsx) while the PDP integration is pending.
//
// This route is intentionally NOT linked from the nav or any page; it exists
// so the selector can be reviewed on desktop + mobile in a real production
// build. Safe to delete once the PDP mounts the component.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { SizeSelector } from '@/components/SizeSelector';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SOLD_OUT = ['XXL'];

export default function SizeDemoPage() {
  const [size, setSize] = useState('M');

  return (
    <main className="min-h-screen bg-transparent px-6 py-24 text-apeiron-ivory">
      <div className="mx-auto w-full max-w-xl">
        <p className="text-xs uppercase tracking-[0.3em] text-ui-concrete">Component demo</p>

        <h1 className="mt-4 text-2xl font-bold uppercase tracking-widest">
          The Precision Hoodie
        </h1>
        <p className="mt-2 text-lg text-ui-concrete">$185</p>

        <div className="mt-12">
          <SizeSelector
            sizes={SIZES}
            soldOut={SOLD_OUT}
            defaultSize="M"
            onChange={setSize}
          />
        </div>

        <p className="mt-10 text-sm uppercase tracking-widest">
          Selected size: <span className="font-bold">{size}</span>
        </p>

        <p className="mt-6 text-xs leading-relaxed text-ui-concrete">
          Keyboard: Tab focuses the selected size, arrow keys move (wrapping and
          skipping sold-out), Home / End jump to the first / last available size.
        </p>
      </div>
    </main>
  );
}
