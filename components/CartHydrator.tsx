'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '@/store/use-cart';
import { getCart } from '@/app/cart/actions';

// ---------------------------------------------------------------------------
// CartHydrator — a zero-render client island that rehydrates the cart store
// from Shopify once on mount.
//
// The store no longer uses `persist` (the cart id lives only in the HTTP-only
// cookie, handled server-side), so the cache starts empty on every page load.
// This effect calls `getCart()` (a server action that reads the cookie and
// queries Shopify) and hands the result to `hydrateFromServer`. With no cookie
// or an expired cart, `getCart()` returns null and the cache stays empty — the
// next add-to-bag creates a fresh cart.
//
// Runs exactly once per LayoutWrapper mount. LayoutWrapper persists across
// client-side navigations in the App Router, so this is one Shopify call per
// page session, not per navigation. It runs inside `useEffect` (client-only,
// after mount) so there is no SSR/client hydration mismatch — the first paint
// shows an empty bag and the badge updates after mount, gated by `useHydrated`
// in the consumers.
// ---------------------------------------------------------------------------

export function CartHydrator() {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    let cancelled = false;
    getCart()
      .then((cart) => {
        if (!cancelled) useCart.getState().hydrateFromServer(cart);
      })
      .catch(() => {
        // Network/Shopify failure on hydration is non-fatal — keep the empty
        // cart. The user can still shop; the next add creates a cart.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}