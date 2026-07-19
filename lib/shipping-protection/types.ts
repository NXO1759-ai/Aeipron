// ---------------------------------------------------------------------------
// Shipping-protection domain types (Captain Shipping Protection / ShipWill).
//
// Captain models shipping protection as a REAL Shopify product (handle
// `shipping-protection`) with ~100 price-laddered variants — each variant is a
// pre-priced protection fee tier. Opting in = adding the correct variant to the
// cart via `cartLinesAdd`. These types are framework-agnostic and carry NO
// Shopify raw shapes, so they are safe to import from client components and the
// Zustand store (unlike `lib/shopify/*`).
// ---------------------------------------------------------------------------

/**
 * A single protection fee tier — one Shopify ProductVariant of the
 * `shipping-protection` product. `id` is the ProductVariant GID (passed to
 * `cartLinesAdd`); `price` is the protection fee (parsed Decimal → number);
 * `title` is the variant title (Captain uses the fee as the title, e.g. "1.00",
 * "2.01", …; a leading `*` marks the merchant's default fixed-price variant,
 * which is excluded from the percentage grid — see `ladder.ts`).
 */
export interface ProtectionVariant {
  id: string; // Shopify ProductVariant GID — passed to cartLinesAdd
  title: string;
  price: number; // the protection fee for this tier (display + cart line price)
}

/**
 * The protection product as resolved server-side from the Storefront API.
 * `variants` is the full tier list (the resolver filters the grid inside
 * `ladder.ts`). Held by the server read and shipped to the client as plain
 * serializable data via the `getProtectionConfig` server action.
 */
export interface ProtectionProduct {
  id: string;
  handle: string;
  title: string;
  variants: ProtectionVariant[];
}

/**
 * The protection configuration shipped to the client store: the tier variants
 * (plain data, no secrets) + the merchant-configured percentage rate. The rate
 * is an env-configured number (see `CAPTAIN_PROTECTION_RATE`); it is NOT secret
 * (it is reflected in the displayed fee) and is safe to hold client-side so the
 * store can recompute the correct tier when the cart subtotal changes.
 */
export interface ProtectionConfig {
  variants: ProtectionVariant[];
  rate: number;
}