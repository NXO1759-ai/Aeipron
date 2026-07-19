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
 * The merchant-editable toggle content, read live from the
 * `shipping_protection_content` Shopify metaobject (single entry, handle
 * `default`). Every field has a fallback so the toggle never renders empty:
 *   - `labelOn` / `labelOff` — the switch label when protection is on / off.
 *   - `description` — the sub-copy under the label.
 *   - `rate` — the merchant's percentage (decimal, e.g. 0.01 for 1%). `null`
 *     means "not set in Shopify" → fall back to the env `CAPTAIN_PROTECTION_RATE`.
 *   - `enabled` — the merchant's master switch; `false` hides the toggle and
 *     disables auto-add/reconcile (so the feature can be turned off from the
 *     Shopify Admin with no code deploy).
 *
 * Held client-side (it is non-secret display/config data) so the toggle reads
 * it directly from the Zustand store.
 */
export interface ProtectionContent {
  labelOn: string;
  labelOff: string;
  description: string;
  /** Decimal rate (0.01 = 1%), or null to fall back to the env rate. */
  rate: number | null;
  enabled: boolean;
}

/**
 * The fallback content used when the metaobject is absent (definition not yet
 * created / not storefront-visible / entry missing) OR when a single field is
 * blank. Mirrors the original hardcoded toggle copy so the feature degrades to
 * the prior behavior, not to empty strings. `rate: null` routes the fee to the
 * env `CAPTAIN_PROTECTION_RATE` (itself defaulting to 0.01 / 1%).
 */
export const DEFAULT_PROTECTION_CONTENT: ProtectionContent = {
  labelOn: 'Shipping protection',
  labelOff: 'Add shipping protection',
  description: 'Cover loss, theft, and damage in transit. Added at checkout by Captain.',
  rate: null,
  enabled: true,
};

/**
 * The protection configuration shipped to the client store: the tier variants
 * (plain data, no secrets), the resolved percentage rate, and the
 * merchant-editable content. `rate` is the EFFECTIVE rate (metaobject rate if
 * set, else the env rate) so the store can recompute the correct tier when the
 * cart subtotal changes without re-fetching. The rate is NOT secret (it is
 * reflected in the displayed fee) and is safe to hold client-side.
 */
export interface ProtectionConfig {
  variants: ProtectionVariant[];
  rate: number;
  content: ProtectionContent;
}