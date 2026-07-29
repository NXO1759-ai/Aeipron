'use client';

// ---------------------------------------------------------------------------
// GateForm — the access-code input on /gate. Posts the code to /api/gate;
// on success the browser is sent back to the page it originally requested
// (the ?from= param — validated to be an internal path only, so the param
// can't be abused as an open redirect). Chrome mirrors the footer forms:
// bordered input + cream arrow button, accent-energy error text.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

export function GateForm() {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code.trim()) {
      setError('Enter the access code');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: code }),
      });

      if (res.ok) {
        // Read ?from= from the address bar at submit time (avoids the
        // useSearchParams Suspense requirement); internal paths only.
        const from = new URLSearchParams(window.location.search).get('from');
        const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/';
        window.location.href = target;
        return;
      }

      setError(res.status === 401 ? 'Incorrect access code' : 'Something went wrong. Please try again.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-2">
      <div className="flex items-stretch">
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          autoComplete="off"
          aria-label="Access code"
          disabled={submitting}
          className="flex-1 bg-apeiron-black border border-ui-concrete/30 border-r-0 px-4 py-3 text-sm text-primary-cream placeholder:text-ui-concrete/60 focus:outline-none focus:border-primary-cream transition-colors disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting}
          aria-label="Enter site"
          className="bg-primary-cream text-apeiron-black px-4 flex items-center justify-center hover:bg-apeiron-ivory transition-colors disabled:opacity-60"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs uppercase tracking-widest font-bold text-accent-energy">
          {error}
        </p>
      ) : null}
    </form>
  );
}
