import type { Metadata } from 'next';
import { GateForm } from './gate-form';

// ---------------------------------------------------------------------------
// /gate — the pre-launch access-code screen. Visitors land here when
// proxy.ts finds no valid gate cookie (only while SITE_GATE_PASSWORD is
// set). The form posts to /api/gate; on success it returns the visitor to
// the page they originally asked for. Noindex, always.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Apeiron — Access',
  robots: { index: false, follow: false },
};

export default function GatePage() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-24">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold uppercase tracking-tight text-apeiron-ivory leading-none">
          Apeiron<sup className="text-[0.55em] font-normal">®</sup>
        </h1>
        <p className="mt-4 text-xs uppercase tracking-widest text-ui-concrete">
          This site is private. Enter the access code to continue.
        </p>
        <GateForm />
      </div>
    </main>
  );
}
