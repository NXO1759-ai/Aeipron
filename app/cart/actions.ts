'use server';

// ---------------------------------------------------------------------------
// Cart server actions — the ONLY way the client mutates cart state.
//
// Each action owns the cart-id cookie lifecycle and returns the authoritative
// domain `Cart` (lib/types.ts) so the Zustand store can refresh its optimistic
// cache. The browser never imports lib/shopify/* or lib/cart-cookie.ts — it
// calls these actions, which run server-side.
//
// SECURITY / TRUST INVARIANTS (enforced here + in tests):
//   - The browser NEVER sends a price. Mutations carry only `merchandiseId` +
//     `quantity` (and `cartId` / `lineId` / `lineIds`). Shopify is the price
//     source of truth — it prices every line from the variant.
//   - The Shopify cart.id (incl. the `?key=` secret) is OPAQUE. It is read from
//     / written to the HTTP-only cookie via lib/cart-cookie.ts, passed VERBATIM
//     to Shopify, and never logged, parsed, or returned to the client.
//   - GraphQL `userErrors` are logged server-side only; the error surfaced to
//     the client is a generic, non-leaking message (no field names, GIDs, or
//     internal detail).
//
// EDGE CASES HANDLED:
//   - No cart yet → addToCart creates one and stores the new id.
//   - Cart expired (cookie holds an id Shopify no longer recognizes):
//       * getCart / getCheckoutUrl detect `cart: null` → clear the cookie,
//         return null so the UI shows an empty bag.
//       * addToCart (cartLinesAdd returns `cart: null`) → clears the cookie and
//         creates a fresh cart with the incoming line (transparent recovery).
//   - updateCartLine with quantity ≤ 0 → routes to cartLinesRemove (no orphan
//     zero-quantity lines).
//   - Bad input (empty ids, non-positive / non-integer quantities) → rejects
//     before any Shopify call.
// ---------------------------------------------------------------------------

import { shopifyRequest } from '@/lib/shopify/client';
import {
  CART_GET_QUERY,
  CART_CREATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_LINES_REMOVE_MUTATION,
} from '@/lib/shopify/queries';
import { mapCart } from '@/lib/shopify/adapter';
import { getCartId, setCartId, clearCartId } from '@/lib/cart-cookie';
import type { Cart } from '@/lib/types';
import type {
  ShopifyCartResponse,
  ShopifyCartCreateResponse,
  ShopifyCartLinesAddResponse,
  ShopifyCartLinesUpdateResponse,
  ShopifyCartLinesRemoveResponse,
  ShopifyCartUserError,
} from '@/lib/shopify/types';

/** Generic, non-leaking error message for any cart mutation failure. */
const CART_ERROR_MESSAGE = 'We could not update your bag. Please try again.';

/**
 * Throw a generic, non-leaking error for Shopify `userErrors`. The raw errors
 * are logged server-side (for debugging) but never surfaced to the client —
 * GraphQL field names, GIDs, and internal messages stay server-side.
 */
function throwOnUserErrors(errors: ShopifyCartUserError[]): void {
  if (!errors || errors.length === 0) return;
  console.error('[cart] Shopify userErrors:', JSON.stringify(errors));
  throw new Error(CART_ERROR_MESSAGE);
}

/** A single line to create/add, as sent to Shopify (no price — ever). */
interface LineInput {
  merchandiseId: string;
  quantity: number;
}

/**
 * Create a new Shopify cart with the given lines, store its opaque id in the
 * HTTP-only cookie, and return the mapped domain `Cart`.
 */
async function createCart(lines: LineInput[]): Promise<Cart> {
  const data = await shopifyRequest<ShopifyCartCreateResponse>(CART_CREATE_MUTATION, {
    input: { lines },
  });
  const created = data.cartCreate;
  throwOnUserErrors(created.userErrors);
  if (!created.cart) {
    // No userErrors but no cart either — should not happen, but guard it.
    throw new Error(CART_ERROR_MESSAGE);
  }
  await setCartId(created.cart.id);
  return mapCart(created.cart);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Read the current cart. Returns `null` when there is no cart cookie, or when
 * the cart has expired (Shopify returns `cart: null`) — in the latter case the
 * cookie is cleared so the next add creates a fresh cart.
 */
export async function getCart(): Promise<Cart | null> {
  const cartId = await getCartId();
  if (!cartId) return null;

  const data = await shopifyRequest<ShopifyCartResponse>(CART_GET_QUERY, { id: cartId });
  if (!data.cart) {
    // Cart expired — forget the id locally. Shopify's copy expires on its own.
    await clearCartId();
    return null;
  }
  return mapCart(data.cart);
}

/**
 * Add a line to the cart. Creates a new cart on the first add (no cookie), or
 * adds to the existing one. If the existing cart has expired (cartLinesAdd
 * returns `cart: null`), transparently creates a fresh cart with the line.
 *
 * Sends only `merchandiseId` + `quantity` — never a price.
 */
export async function addToCart(input: {
  merchandiseId: string;
  quantity: number;
}): Promise<Cart> {
  const merchandiseId = String(input?.merchandiseId ?? '');
  const quantity = Number(input?.quantity);
  if (!merchandiseId) throw new Error(CART_ERROR_MESSAGE);
  // Reject non-integers outright (a fractional qty is a client bug / abuse) —
  // do NOT silently floor, so the bug surfaces instead of being masked.
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error(CART_ERROR_MESSAGE);

  const lines: LineInput[] = [{ merchandiseId, quantity }];
  const cartId = await getCartId();

  if (!cartId) {
    return createCart(lines);
  }

  const data = await shopifyRequest<ShopifyCartLinesAddResponse>(CART_LINES_ADD_MUTATION, {
    cartId,
    lines,
  });
  const added = data.cartLinesAdd;
  throwOnUserErrors(added.userErrors);

  if (!added.cart) {
    // The cart id no longer resolves (expired). Recover transparently: forget
    // the stale id and create a fresh cart with the incoming line.
    await clearCartId();
    return createCart(lines);
  }

  return mapCart(added.cart);
}

/**
 * Update a line's quantity. A quantity of 0 (or any non-positive integer)
 * routes to cartLinesRemove so no zero-quantity line lingers. Sends only the
 * cart-line GID (`id`) + `quantity` — never a price.
 */
export async function updateCartLine(input: {
  lineId: string;
  quantity: number;
}): Promise<Cart> {
  const lineId = String(input?.lineId ?? '');
  const raw = Number(input?.quantity);
  if (!lineId) throw new Error(CART_ERROR_MESSAGE);
  if (!Number.isFinite(raw)) throw new Error(CART_ERROR_MESSAGE);

  const cartId = await getCartId();
  if (!cartId) throw new Error(CART_ERROR_MESSAGE);

  // Floor toward zero; anything ≤ 0 (including 0.5 → 0) removes the line.
  const quantity = Math.floor(raw);
  if (quantity <= 0) {
    return removeCartLineInternal(cartId, [lineId]);
  }

  const data = await shopifyRequest<ShopifyCartLinesUpdateResponse>(
    CART_LINES_UPDATE_MUTATION,
    { cartId, lines: [{ id: lineId, quantity }] },
  );
  const updated = data.cartLinesUpdate;
  throwOnUserErrors(updated.userErrors);
  if (!updated.cart) {
    await clearCartId();
    throw new Error(CART_ERROR_MESSAGE);
  }
  return mapCart(updated.cart);
}

/** Remove a single line by its cart-line GID. */
export async function removeCartLine(input: { lineId: string }): Promise<Cart> {
  const lineId = String(input?.lineId ?? '');
  if (!lineId) throw new Error(CART_ERROR_MESSAGE);
  const cartId = await getCartId();
  if (!cartId) throw new Error(CART_ERROR_MESSAGE);
  return removeCartLineInternal(cartId, [lineId]);
}

/** Internal: run cartLinesRemove for the given cart-line GIDs and map the result. */
async function removeCartLineInternal(cartId: string, lineIds: string[]): Promise<Cart> {
  const data = await shopifyRequest<ShopifyCartLinesRemoveResponse>(CART_LINES_REMOVE_MUTATION, {
    cartId,
    lineIds,
  });
  const removed = data.cartLinesRemove;
  throwOnUserErrors(removed.userErrors);
  if (!removed.cart) {
    await clearCartId();
    throw new Error(CART_ERROR_MESSAGE);
  }
  return mapCart(removed.cart);
}

/**
 * Forget the cart id locally (clears the cookie). Does NOT delete the cart at
 * Shopify (carts there expire on their own). Clearing the optimistic cache is
 * the Zustand store's job — this action only clears the persisted id.
 */
export async function clearCart(): Promise<void> {
  await clearCartId();
}

/**
 * Return the Shopify hosted-checkout URL for the current cart, or `null` if
 * there is no cart / it has expired. The checkout page's redirect button calls
 * this and sends the browser to Shopify's hosted checkout.
 */
export async function getCheckoutUrl(): Promise<string | null> {
  const cart = await getCart();
  return cart?.checkoutUrl ?? null;
}