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
import { SHIPPING_PROTECTION_QUERY, SHIPPING_PROTECTION_CONTENT_QUERY } from '@/lib/shopify/queries';
import type {
  ShopifyShippingProtectionResponse,
  ShopifyShippingProtectionVariant,
  ShopifyMetaobjectResponse,
} from '@/lib/shopify/types';
import type { ProtectionConfig, ProtectionContent, ProtectionProduct, ProtectionVariant } from './types';
import { DEFAULT_PROTECTION_CONTENT } from './types';

/**
 * The Shopify handle of the Captain shipping-protection product. Captain creates
 * this product with this exact handle when the app is installed.
 */
export const SHIPPING_PROTECTION_HANDLE = 'shipping-protection';

/**
 * The metaobject type + entry handle that drive the toggle's copy + rate +
 * enabled flag from the Shopify Admin (no GitHub deploy). Created/seeded by
 * `scripts/seed-shipping-protection-content.mjs`.
 */
const PROTECTION_CONTENT_TYPE = 'shipping_protection_content';
const PROTECTION_CONTENT_HANDLE = 'default';

/**
 * The LAST-RESORT fallback protection percentage rate, used only when BOTH the
 * `shipping_protection_content` metaobject's `rate` field is absent AND the
 * `CAPTAIN_PROTECTION_RATE` env var is unset/unparsable. The client confirmed
 * 1% for this store, so the fallback is 1% (not Captain's doc-example 2%).
 */
const DEFAULT_PROTECTION_RATE = 0.01;

/**
 * Normalize a raw rate string ("0.01", "1", "1%", "2", "1.5%") to a decimal rate.
 * Accepts a decimal (`0.01`), a whole percent (`1` / `1%` / `2`), or a decimal
 * percent with a trailing `%` (`1.5%` → 0.015). Returns `null` when blank /
 * unparsable so the caller falls back to the env rate. Used for both the
 * metaobject `rate` field and the env var (kept in sync so the two sources parse
 * identically).
 *
 * Disambiguation: a value written WITH a `%` sign, OR a bare number ≥ 1, is a
 * PERCENT (divided by 100); a bare decimal < 1 (e.g. `0.01`, `0.02`) is already
 * a decimal rate. So `1` / `1%` → 0.01, `2` → 0.02, `0.5%` → 0.005, `0.01` → 0.01.
 * (A bare `0.5` is treated as the decimal 0.5 — a merchant wanting 0.5% should
 * write `0.5%` or `0.005`.)
 */
export function normalizeProtectionRate(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const hadPercent = /%$/.test(str);
  const trimmed = str.replace(/%$/, '').trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  // Explicit `%` sign, OR a bare value ≥ 1 → it's a percent → divide by 100.
  return hadPercent || n >= 1 ? n / 100 : n;
}

/**
 * Read the last-resort fallback protection rate from the environment. Accepts
 * `0.01` / `1` / `1%`. Falls back to `DEFAULT_PROTECTION_RATE` (1%) when
 * unset/unparsable so the feature never crashes on a missing env var. The
 * metaobject `rate` (if set) takes precedence over this — see `getProtectionConfig`.
 */
export function getProtectionRate(): number {
  return normalizeProtectionRate(process.env.CAPTAIN_PROTECTION_RATE) ?? DEFAULT_PROTECTION_RATE;
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
 * Test-only: reset the module-level product memo so a prior test's fetch can't
 * leak into the next (production code never does this). Mirrors the cart store's
 * `__resetCartMutationQueueForTests`.
 */
export function __resetProtectionProductCacheForTests(): void {
  cachedProduct = null;
}

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
 * Fetch the merchant-editable toggle content from the
 * `shipping_protection_content` metaobject (single entry, handle `default`) via
 * the public Storefront API. Returns `null` when the definition isn't
 * storefront-visible or the entry doesn't exist — the caller falls back to
 * `DEFAULT_PROTECTION_CONTENT` (hardcoded copy + env rate) so the feature keeps
 * working before/without the metaobject.
 *
 * NOT memoized — fetched fresh on every `getProtectionConfig` call so a Shopify
 * Admin edit reflects on the site's next cart hydrate (the client's "edit from
 * Shopify and it shows up" requirement). The cost is one small Storefront call
 * per hydrate; the (much larger) product fetch stays memoized above.
 *
 * The Storefront API returns every field `value` as a STRING (booleans as
 * "true"/"false"); parsed here per known key. Blank/missing fields fall back to
 * the corresponding `DEFAULT_PROTECTION_CONTENT` field so a partial entry never
 * renders empty copy.
 */
export async function getShippingProtectionContent(): Promise<ProtectionContent | null> {
  const data = await shopifyRequest<ShopifyMetaobjectResponse>(SHIPPING_PROTECTION_CONTENT_QUERY, {
    handle: { handle: PROTECTION_CONTENT_HANDLE, type: PROTECTION_CONTENT_TYPE },
  });
  const mo = data.metaobject;
  if (!mo) return null;

  const fields = new Map<string, string>();
  for (const f of mo.fields) fields.set(f.key, f.value ?? '');

  const rate = normalizeProtectionRate(fields.get('rate'));
  const enabledRaw = fields.get('enabled') ?? '';

  return {
    labelOn: fields.get('label_on')?.trim() || DEFAULT_PROTECTION_CONTENT.labelOn,
    labelOff: fields.get('label_off')?.trim() || DEFAULT_PROTECTION_CONTENT.labelOff,
    description: fields.get('description') ?? DEFAULT_PROTECTION_CONTENT.description,
    // `null` when unset/unparseable → getProtectionConfig falls back to the env rate.
    rate,
    // Treat blank as enabled (a definition without the field shouldn't disable the feature).
    enabled: enabledRaw.trim() === '' ? true : enabledRaw.trim() === 'true',
  };
}

/**
 * Assemble the `ProtectionConfig` shipped to the client store: the available
 * protection variants (plain data), the EFFECTIVE percentage rate (metaobject
 * `rate` if set, else the env `CAPTAIN_PROTECTION_RATE`, else the 1% default),
 * and the merchant-editable content. Returns `null` when the product is not
 * visible to the Storefront API (the toggle renders nothing; the feature
 * degrades silently). Never throws on a missing product or content metaobject —
 * a missing metaobject falls back to `DEFAULT_PROTECTION_CONTENT` + env rate.
 */
export async function getProtectionConfig(): Promise<ProtectionConfig | null> {
  const product = await getShippingProtectionProduct();
  if (!product || product.variants.length === 0) return null;

  // Fresh fetch so Shopify edits reflect live. A failed content fetch degrades
  // to the default content (non-fatal) — the product/rate still ship.
  let content: ProtectionContent;
  try {
    content = (await getShippingProtectionContent()) ?? DEFAULT_PROTECTION_CONTENT;
  } catch {
    content = DEFAULT_PROTECTION_CONTENT;
  }

  // Metaobject rate takes precedence; env rate is the fallback.
  const rate = content.rate ?? getProtectionRate();
  return { variants: product.variants, rate, content };
}