import 'server-only';

// ---------------------------------------------------------------------------
// Navidium shipping protection — server-only quote client for the cart-drawer
// protection toggle (app/cart/protection.ts + components/cart/ShippingProtection).
//
// Navidium exposes a per-store lambda endpoint that maps a cart payload to the
// Shopify variant of ITS protection product at the right price tier:
//   POST { total_price, items: [{ product_id, price, quantity, ... }],
//          country_name, shop_url }
//   → { statusCode: 200, data: { variant_id: "46569521709253", price: "0.75",
//                                widget_display_status: false } }
// The variant is TIERED by cart value (quantity is always 1), so the quote must
// be re-requested whenever the merchandise lines change.
//
// Env vars (see .env.example):
//   NAVIDIUM_API_URL      — the lambda URL from the Navidium dashboard. Unset →
//                           no quote and the toggle is not rendered.
//   NAVIDIUM_SHOP_URL     — the shop_url Navidium is bound to (the store's
//                           ORIGINAL myshopify domain). Defaults to
//                           SHOPIFY_STORE_DOMAIN.
//   NAVIDIUM_COUNTRY_NAME — defaults to 'United States'.
//
// Failure contract: NEVER throws. Unconfigured, unreachable, non-200, or a
// malformed payload all resolve to null (logged server-side) and the toggle
// simply stays hidden. Quotes are intentionally NOT cached (`no-store`) — the
// tier depends on the live cart total.
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_COUNTRY_NAME = 'United States';
const SHOPIFY_VARIANT_GID_PREFIX = 'gid://shopify/ProductVariant/';

/** One merchandise line as Navidium expects it (product reference + price + qty). */
export interface NavidiumQuoteItem {
  productId: string;
  price: number;
  quantity: number;
  productType?: string;
  sku?: string;
}

export interface NavidiumQuoteInput {
  /** Merchandise subtotal (protection line excluded), in cart currency. */
  totalPrice: number;
  items: NavidiumQuoteItem[];
  countryName?: string;
}

export interface ProtectionQuote {
  /** Shopify variant GID of the Navidium protection product at this tier. */
  variantId: string;
  /** Tier price in cart currency (quantity is always 1). */
  price: number;
}

/** Raw lambda response shape (only the fields we read). */
interface NavidiumApiResponse {
  statusCode?: number;
  data?: {
    variant_id?: string | number;
    price?: string | number;
  };
}

/**
 * Request a protection quote for the current merchandise lines. Returns null
 * when Navidium is unconfigured or the answer is unusable — callers treat null
 * as "hide the toggle", never as an error.
 */
export async function getProtectionQuote(input: NavidiumQuoteInput): Promise<ProtectionQuote | null> {
  const apiUrl = process.env.NAVIDIUM_API_URL;
  if (!apiUrl) {
    // Unconfigured is the normal state for stores without Navidium — no log spam.
    return null;
  }
  const shopUrl = process.env.NAVIDIUM_SHOP_URL || process.env.SHOPIFY_STORE_DOMAIN;
  if (!shopUrl) {
    console.error('[navidium] no shop url configured (NAVIDIUM_SHOP_URL / SHOPIFY_STORE_DOMAIN)');
    return null;
  }
  if (!Number.isFinite(input.totalPrice) || input.totalPrice < 0 || input.items.length === 0) {
    console.error('[navidium] refusing to quote an empty or invalid cart payload');
    return null;
  }

  const payload = {
    total_price: input.totalPrice,
    items: input.items.map((item) => ({
      product_id: item.productId,
      price: item.price,
      quantity: item.quantity,
      ...(item.productType ? { product_type: item.productType } : {}),
      ...(item.sku ? { sku: item.sku } : {}),
    })),
    country_name: input.countryName || process.env.NAVIDIUM_COUNTRY_NAME || DEFAULT_COUNTRY_NAME,
    shop_url: shopUrl,
  };

  let raw: NavidiumApiResponse;
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error('[navidium] quote request failed with HTTP', res.status);
      return null;
    }
    raw = (await res.json()) as NavidiumApiResponse;
  } catch {
    console.error('[navidium] quote request failed: network error');
    return null;
  }

  // Validate hard: the variant id must be a numeric Shopify id and the price a
  // finite non-negative number. Anything else is a misconfigured endpoint.
  const variantIdRaw = raw?.data?.variant_id;
  const variantIdText = typeof variantIdRaw === 'number' ? String(variantIdRaw) : variantIdRaw;
  if (!variantIdText || !/^\d+$/.test(variantIdText)) {
    console.error('[navidium] quote response has no numeric variant_id');
    return null;
  }
  const price = Number(raw?.data?.price);
  if (!Number.isFinite(price) || price < 0) {
    console.error('[navidium] quote response has no usable price');
    return null;
  }

  return { variantId: `${SHOPIFY_VARIANT_GID_PREFIX}${variantIdText}`, price };
}
