'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Wire this to your error-reporting sink (Sentry, etc.).
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold uppercase tracking-[0.2em] mb-6">Something broke</h1>
      <p className="text-ui-concrete uppercase tracking-widest text-sm mb-10">An unexpected error occurred. Try again.</p>
      <button
        type="button"
        onClick={reset}
        className="border border-apeiron-ivory px-10 py-4 uppercase tracking-widest font-bold text-sm hover:bg-apeiron-ivory hover:text-apeiron-black transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
