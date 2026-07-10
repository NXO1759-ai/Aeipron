'use client';

import { useState } from 'react';
import { getCheckoutUrl } from '@/app/cart/actions';

// ---------------------------------------------------------------------------
// CheckoutButton — the only interactive piece of the (otherwise server-rendered)
// checkout page. On click it fetches the Shopify hosted-checkout URL via the
// `getCheckoutUrl` server action and redirects the browser there. Shopify's
// hosted checkout collects shipping + payment and computes the final total —
// we never run a custom checkout form.
//
// Edge cases:
//   - No URL (cart expired between render and click) → show a "refresh" message
//     instead of silently doing nothing.
//   - Action throws (network/Shopify error) → show a retry message.
// ---------------------------------------------------------------------------

export function CheckoutButton() {
  const [status, setStatus] = useState<'idle' | 'redirecting' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('redirecting');
    try {
      const url = await getCheckoutUrl();
      if (url) {
        // Hand off to Shopify's hosted checkout. A full page navigation —
        // the SPA stays out of the payment flow entirely.
        window.location.href = url;
        return;
      }
      // The cart disappeared (expired / cleared) since the page rendered.
      setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'error') {
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="w-full border border-primary-obsidian text-primary-obsidian py-4 uppercase tracking-widest font-bold text-sm hover:bg-primary-obsidian hover:text-white transition-colors"
        >
          Try again
        </button>
        <p role="alert" className="mt-3 text-xs uppercase tracking-widest text-ui-concrete text-center">
          Your bag may have changed — please refresh the page.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'redirecting'}
      className="w-full bg-accent-energy text-primary-cream py-6 uppercase tracking-widest font-bold hover:bg-accent-energy/90 transition-colors disabled:opacity-60"
    >
      {status === 'redirecting' ? 'Redirecting to checkout…' : 'Checkout'}
    </button>
  );
}