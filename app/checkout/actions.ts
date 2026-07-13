'use server';

// ---------------------------------------------------------------------------
// Checkout server actions (Phase 4b — custom checkout).
//
// The ONLY way the /checkout client island mutates the cart's buyer identity +
// delivery address + selected shipping method. Mirrors the cart server-action
// pattern (app/cart/actions.ts): 'use server', go through shopifyRequest, log
// userErrors + warnings server-side, throw a generic non-leaking message to the
// client, own the cart-id cookie lifecycle, return the mapped domain shape.
//
// FLOW (matches Shopify's documented headless checkout flow):
//   1. updateCheckoutContact  → cartBuyerIdentityUpdate (email/phone/country)
//                              then cartDeliveryAddressesAdd (selected: true,
//                              which triggers rate calculation) → returns
//                              CheckoutDetails (cart + deliveryGroups w/ options).
//   2. selectDeliveryOption   → cartSelectedDeliveryOptionsUpdate → returns
//                              CheckoutDetails (cost.totalAmount now incl. shipping).
//   3. (redirect)              → getCheckoutUrl (reused from app/cart/actions)
//                              → cart.checkoutUrl prefills Shopify's hosted
//                              checkout (card entry happens there).
//
// SECURITY / TRUST INVARIANTS (enforced here + in tests):
//   - The browser NEVER sends a price. Inputs carry only contact fields,
//     countryCode/provinceCode, address fields, deliveryGroupId, and
//     deliveryOptionHandle (an opaque Shopify handle). Shopify prices every
//     line and computes shipping + tax itself.
//   - The Shopify cart.id (incl. the `?key=` secret) is OPAQUE — passed VERBATIM
//     to Shopify, never logged, parsed, or returned to the client.
//   - GraphQL `userErrors` AND `warnings` are logged server-side only; the
//     client gets a generic, non-leaking message (no field names, GIDs, or
//     internal detail). `warnings` are non-fatal (e.g. "address could not be
//     validated") and never block the flow.
//   - The client's form input is RE-VALIDATED server-side with the zod schema
//     (never trust the client) before any Shopify call.
//
// ADDRESS HANDLING: we always `cartDeliveryAddressesAdd` with `selected: true`
// (Shopify's documented headless flow). The latest selected address is the one
// checkout uses; re-submitting the address form adds a fresh selected address.
// This avoids fetching the uncertain `CartSelectableAddress` id path needed for
// `cartDeliveryAddressesUpdate`. Carts expire on their own, so any prior
// (now-unselected) addresses are harmless.
// ---------------------------------------------------------------------------

import { shopifyRequest } from '@/lib/shopify/client';
import {
  CART_WITH_DELIVERY_QUERY,
  CART_BUYER_IDENTITY_UPDATE_MUTATION,
  CART_DELIVERY_ADDRESSES_ADD_MUTATION,
  CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION,
} from '@/lib/shopify/queries';
import { mapCheckoutDetails } from '@/lib/shopify/adapter';
import { getCartId, clearCartId } from '@/lib/cart-cookie';
import { checkoutContactSchema, toShopifyAddress } from '@/lib/checkout-schema';
import type { CheckoutDetails } from '@/lib/types';
import type {
  ShopifyCartResponse,
  ShopifyCartBuyerIdentityUpdateResponse,
  ShopifyCartDeliveryAddressesAddResponse,
  ShopifyCartSelectedDeliveryOptionsUpdateResponse,
  ShopifyCartUserError,
} from '@/lib/shopify/types';

/** Generic, non-leaking error message for any checkout mutation failure. */
const CHECKOUT_ERROR_MESSAGE = 'We could not complete this step. Please try again.';

/**
 * Log Shopify userErrors server-side (for debugging), then throw a generic,
 * non-leaking error. GraphQL field names, GIDs, and internal messages never
 * reach the client.
 */
function throwOnUserErrors(errors: ShopifyCartUserError[]): void {
  if (!errors || errors.length === 0) return;
  console.error('[checkout] Shopify userErrors:', JSON.stringify(errors));
  throw new Error(CHECKOUT_ERROR_MESSAGE);
}

/**
 * Log Shopify warnings server-side (non-fatal — e.g. "address could not be
 * validated"). Never throws, never blocks the flow, never reaches the client.
 */
function logWarnings(warnings: unknown[] | undefined, scope: string): void {
  if (warnings && warnings.length > 0) {
    console.warn(`[checkout] Shopify ${scope} warnings:`, JSON.stringify(warnings));
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Set the buyer's contact info + shipping address on the cart.
 *
 * Re-validates the form payload server-side (never trusts the client), then:
 *   1. cartBuyerIdentityUpdate — email, phone, countryCode.
 *   2. cartDeliveryAddressesAdd — the shipping address, selected: true
 *      (triggers delivery-rate calculation so the response carries deliveryOptions).
 *
 * Returns the CheckoutDetails (cart + deliveryGroups with the available shipping
 * options). Returns `null` when there is no cart cookie (empty bag) or when the
 * cart expired mid-flow (cookie cleared). Throws a generic error on userErrors
 * or a bad payload — the client shows a retry message.
 *
 * The browser sends only contact + address fields (and countryCode/provinceCode)
 * — never a price.
 */
export async function updateCheckoutContact(input: unknown): Promise<CheckoutDetails | null> {
  // Re-validate server-side. The client already validated with the same schema,
  // but a request can be crafted directly — never trust the client.
  const parsed = checkoutContactSchema.safeParse(input);
  if (!parsed.success) {
    // Don't surface zod detail (could leak field expectations); generic message.
    throw new Error(CHECKOUT_ERROR_MESSAGE);
  }
  const { buyerIdentity, deliveryAddress } = toShopifyAddress(parsed.data);

  const cartId = await getCartId();
  if (!cartId) return null; // empty bag (no cart / expired cookie)

  // 1. Buyer identity (email / phone / countryCode for market pricing).
  const identityData = await shopifyRequest<ShopifyCartBuyerIdentityUpdateResponse>(
    CART_BUYER_IDENTITY_UPDATE_MUTATION,
    { cartId, buyerIdentity },
  );
  const identity = identityData.cartBuyerIdentityUpdate;
  logWarnings(identity.warnings, 'cartBuyerIdentityUpdate');
  throwOnUserErrors(identity.userErrors);
  if (!identity.cart) {
    // Cart expired between render and this call.
    await clearCartId();
    return null;
  }

  // 2. Delivery address — selected: true triggers rate calculation, so the
  //    response's deliveryGroups carry the available shipping options.
  const addresses = [{ address: { deliveryAddress }, selected: true }];
  const deliveryData = await shopifyRequest<ShopifyCartDeliveryAddressesAddResponse>(
    CART_DELIVERY_ADDRESSES_ADD_MUTATION,
    { cartId, addresses },
  );
  const delivery = deliveryData.cartDeliveryAddressesAdd;
  logWarnings(delivery.warnings, 'cartDeliveryAddressesAdd');
  throwOnUserErrors(delivery.userErrors);
  if (!delivery.cart) {
    await clearCartId();
    return null;
  }

  return mapCheckoutDetails(delivery.cart);
}

/**
 * Select a shipping method (delivery option) on the cart.
 *
 * `deliveryGroupId` + `deliveryOptionHandle` are opaque Shopify identifiers read
 * off the cart's deliveryGroups (the handle comes from a DeliveryOption). After
 * this mutation, the cart's `cost.totalAmount` reflects the selected shipping
 * cost (still an estimate — tax/duty computed at Shopify's hosted checkout).
 *
 * Returns the refreshed CheckoutDetails, or `null` if there is no cart / it
 * expired. Throws a generic error on userErrors or a bad payload.
 *
 * The browser sends only the two opaque handles — never a price.
 */
export async function selectDeliveryOption(input: {
  deliveryGroupId: string;
  deliveryOptionHandle: string;
}): Promise<CheckoutDetails | null> {
  const deliveryGroupId = String(input?.deliveryGroupId ?? '');
  const deliveryOptionHandle = String(input?.deliveryOptionHandle ?? '');
  if (!deliveryGroupId || !deliveryOptionHandle) throw new Error(CHECKOUT_ERROR_MESSAGE);

  const cartId = await getCartId();
  if (!cartId) return null;

  const data = await shopifyRequest<ShopifyCartSelectedDeliveryOptionsUpdateResponse>(
    CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION,
    {
      cartId,
      selectedDeliveryOptions: [{ deliveryGroupId, deliveryOptionHandle }],
    },
  );
  const updated = data.cartSelectedDeliveryOptionsUpdate;
  logWarnings(updated.warnings, 'cartSelectedDeliveryOptionsUpdate');
  throwOnUserErrors(updated.userErrors);
  if (!updated.cart) {
    await clearCartId();
    return null;
  }

  return mapCheckoutDetails(updated.cart);
}

/**
 * Read the cart WITH its delivery groups (shipping options). Used to rehydrate
 * the checkout state after a navigation / refresh (e.g. the buyer returns to
 * /checkout with an address + selected option already on the cart). Returns
 * `null` when there is no cart / it expired (cookie cleared).
 */
export async function getCheckoutDetails(): Promise<CheckoutDetails | null> {
  const cartId = await getCartId();
  if (!cartId) return null;

  const data = await shopifyRequest<ShopifyCartResponse>(CART_WITH_DELIVERY_QUERY, { id: cartId });
  if (!data.cart) {
    await clearCartId();
    return null;
  }
  return mapCheckoutDetails(data.cart);
}