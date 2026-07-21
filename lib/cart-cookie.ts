// ---------------------------------------------------------------------------
// Cart cookie helper — the ONLY place the Shopify cart id is read from / written
// to a cookie.
//
// The Shopify cart id has the form `gid://shopify/Cart/<token>?key=<secret>`.
// The full id (INCLUDING the `?key=<secret>` part) is required for cart mutations
// and for the `cart` query to return private buyer data. The secret is
// sensitive: it must never be logged, never returned to the client, never put
// in a shareable URL, and never parsed/split/decoded — treat the whole string
// as an opaque token. Shopify may change the format/length at any time.
//
// The cookie is HTTP-ONLY so browser JavaScript can never read it (prevents the
// secret leaking via XSS). It is SECURE in production (HTTPS-only), SameSite=Lax
// (sent on top-level navigation + same-site requests), and lives 14 days.
//
// `import 'server-only'` makes any client-component import fail at build time —
// this module must never reach the browser bundle.
//
// DO NOT import this from a 'use client' component. Only the cart server actions
// (app/cart/actions.ts) import it.
// ---------------------------------------------------------------------------

import 'server-only';
import { cookies } from 'next/headers';

/** The HTTP-only cookie name holding the opaque Shopify cart id. */
export const CART_COOKIE = 'apeiron-cart-id';

/** Cookie lifetime: 14 days, in seconds. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

/**
 * Read the opaque Shopify cart id from the cookie, or `null` if there is no
 * cart yet. The value is returned VERBATIM — never parsed, split, or decoded.
 *
 * In Next.js 15 `cookies()` is async, so this is async; `await`-ing it is safe
 * (and a no-op) if a future version is sync again.
 */
export async function getCartId(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/**
 * Persist the opaque Shopify cart id in an HTTP-only cookie. Called by the cart
 * server action on `cartCreate` (the first add-to-bag). The id is stored
 * VERBATIM — never transformed.
 */
export async function setCartId(id: string): Promise<void> {
  const store = await cookies();
  store.set({
    name: CART_COOKIE,
    value: id,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Delete the cart cookie. Called when the cart has expired (Shopify returns
 * null for the id) or when the user clears the bag. Does NOT delete the cart
 * server-side at Shopify (carts there expire on their own); it only forgets the
 * id locally so the next add-to-bag creates a fresh cart.
 */
export async function clearCartId(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}
