'use client';

import { useCallback, useState } from 'react';
import { getCheckoutUrl } from '@/app/cart/actions';

// ---------------------------------------------------------------------------
// useCheckoutRedirect — the single shared mechanism for sending the buyer to
// Shopify's hosted checkout. One behavior, three call sites: the cart drawer's
// "Proceed to checkout", the /cart page's "Proceed to checkout", and the
// (dormant) /checkout page's <CheckoutButton>. Keeping the logic here means
// the idle/redirecting/error states + the "bag may have changed" fallback can
// never drift between them.
//
// FLOW: redirect() → getCheckoutUrl() server action (re-reads the cart fresh,
// so a cart that expired/emptied between render and click is caught) → on a
// valid URL, window.location.href navigates the whole page to Shopify's hosted
// checkout (card entry happens there; PCI scope stays on Shopify). On null
// (cart gone) or a thrown action (network/Shopify error) → 'error' state; the
// call site renders a "Try again" affordance (reset() returns to 'idle').
//
// TRUST BOUNDARY: the only server action imported is getCheckoutUrl, which
// takes NO arguments — the client sends no price, no ids. The opaque cart id
// is read server-side from the HTTP-only cookie and passed verbatim to Shopify.
// This hook (and therefore every call site) imports nothing from lib/shopify/*
// or lib/cart-cookie (server-only).
// ---------------------------------------------------------------------------

export type CheckoutRedirectStatus = 'idle' | 'redirecting' | 'error';

export function useCheckoutRedirect() {
  const [status, setStatus] = useState<CheckoutRedirectStatus>('idle');

  const redirect = useCallback(async () => {
    setStatus('redirecting');
    try {
      const url = await getCheckoutUrl();
      if (url) {
        // Full page navigation to Shopify's hosted checkout. The SPA stays
        // out of the payment flow entirely.
        window.location.href = url;
        return;
      }
      // The cart disappeared (expired / cleared) since the page rendered.
      setStatus('error');
    } catch {
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => setStatus('idle'), []);

  return { status, redirect, reset };
}