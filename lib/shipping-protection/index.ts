// ---------------------------------------------------------------------------
// Shipping-protection server read — the only server-only file in this module.
//
// Fetches the `shipping-protection` product from the Storefront API, maps its
// variants to the plain `ProtectionVariant` shape, reads the merchant-configured
// percentage rate from `CAPTAIN_PROTECTION_RATE`, and assembles a
// `ProtectionConfig` that the `getProtectionConfig` server action ships to the
// client store as plain serializable data (no secrets).
//
// `import 'server-only'` makes any client import fail at build time — the
// Storefront token must never reach the browser bundle. Client code imports the
// PURE helpers from `./ladder` instead, never this file.
// ---------------------------------------------------------------------------

import 'server-only';

import { shopifyRequest } from '@/lib/shopify/client';
import { SHIPPING_PROTECTION_QUERY } from '@/lib/shopify/queries';
import type { ShopifyShippingProtectionResponse, ShopifyShippingProtectionVariant } from '@/lib/shopify/types';
import type { ProtectionConfig, ProtectionProduct, ProtectionVariant } from './types';

/**
 * The Shopify handle of the Captain shipping-protection product. Captain creates
 * this product with this exact handle when the app is installed.
 */
export const SHIPPING_PROTECTION_HANDLE = 'shipping-protection';

/**
 * The default protection percentage rate. Captain's docs use 2% as the
 * illustrative example; the MERCHANT sets the real value in the Captain app
 * dashboard and must mirror it here via the `CAPTAIN_PROTECTION_RATE` env var.
 * This default exists so the feature degrades to a reasonable value if the env
 * var is unset, NOT because 2% is confirmed for this store.
 */
const DEFAULT_PROTECTION_RATE = 0.02;

/**
 * Read the merchant-configured protection rate from the environment. Accepts
 * percentages written as either a decimal (`0.02`) or a whole percent (`2`).
 * Falls back to the default when unset / unparsable so the feature never crashes
 * on a missing env var — the merchant must still confirm the value is correct.
 */
export function getProtectionRate(): number {
  const raw = process.env.CAPTAIN_PROTECTION_RATE;
  if (!raw) return DEFAULT_PROTECTION_RATE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PROTECTION_RATE;
  // `2` means 2%; `0.02` means 2%. Normalize a value > 1 to a decimal.
  return n > 1 ? n / 100 : n;
}

/**
 * Map the raw Shopify variant nodes to the plain `ProtectionVariant` shape.
 * Keeps ONLY available-for-sale variants (an unavailable tier can't be added to
 * the cart) and parses the fee Decimal string → number. The `*`-prefixed
 * default-fixed-price fallback is kept here (so `isProtectionLine` recognizes a
 * line added via any path); the percentage-grid resolver filters it out via
 * `isGridVariant` in `./ladder`.
 */
function mapVariants(nodes: ShopifyShippingProtectionVariant[]): ProtectionVariant[] {
  return nodes
    .filter((v) => v.availableForSale)
    .map((v) => ({
      id: v.id,
      title: v.title,
      price: Number(v.price.amount),
    }));
}

// Module-level memo: the 100-variant product changes rarely (only when the
// merchant re-ladders fees in Captain). Fetch once per warm process; a cold
// start (new serverless instance) re-fetches. Dedupes concurrent callers so the
// drawer + /cart page hydrating simultaneously share one Storefront call.
let cachedProduct: Promise<ProtectionProduct | null> | null = null;

/**
 * Fetch the `shipping-protection` product and map it to `ProtectionProduct`.
 * Returns `null` when the product is not visible to the Storefront API (not
 * published to the app's sales channel, or UNLISTED) — the caller treats null
 * as "protection unavailable" and the toggle renders nothing. Memoized per
 * warm process; never throws on a missing product (only on network/Shopify
 * errors, which surface as `ShopifyClientError`).
 */
export function getShippingProtectionProduct(): Promise<ProtectionProduct | null> {
  if (!cachedProduct) {
    cachedProduct = (async () => {
      const data = await shopifyRequest<ShopifyShippingProtectionResponse>(
        SHIPPING_PROTECTION_QUERY,
        { handle: SHIPPING_PROTECTION_HANDLE },
      );
      if (!data.product) return null;
      return {
        id: data.product.id,
        handle: data.product.handle,
        title: data.product.title,
        variants: mapVariants(data.product.variants.nodes),
      };
    })().catch((err) => {
      // A fetch failure should NOT poison the memo for the process lifetime —
      // drop the cache so the next call retries. Re-throw so the caller's
      // server action surfaces a generic error (no Shopify detail leaks).
      cachedProduct = null;
      throw err;
    });
  }
  return cachedProduct;
}

/**
 * Assemble the `ProtectionConfig` shipped to the client store: the available
 * protection variants (plain data) + the merchant's percentage rate. Returns
 * `null` when the product is not visible to the Storefront API (the toggle
 * renders nothing; the feature degrades silently). Never throws on a missing
 * product.
 */
export async function getProtectionConfig(): Promise<ProtectionConfig | null> {
  const product = await getShippingProtectionProduct();
  if (!product || product.variants.length === 0) return null;
  return { variants: product.variants, rate: getProtectionRate() };
}