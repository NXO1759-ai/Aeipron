import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Cart, CartLine } from '../lib/types';

// ---------------------------------------------------------------------------
// Navidium shipping-protection tests.
//
// lib/navidium.ts (quote client) and app/cart/protection.ts (server action)
// are covered together: env configuration, the exact request payload, response
// validation (numeric variant id, finite price), the never-throws contract,
// and the action's server-side pricing (lines/prices come from the mocked
// server cart — never from the request). `fetch` is mocked so nothing hits
// the network.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

// The quote action derives lines + prices from the AUTHORITATIVE server-side
// cart (trust invariant: the browser never sends a price). The cart actions
// module is mocked so each test controls the cart the action sees.
vi.mock('@/app/cart/actions', () => ({ getCart: vi.fn() }));

const { getProtectionQuote } = await import('@/lib/navidium');
const { getShippingProtectionQuote } = await import('@/app/cart/protection');
const { getCart } = await import('@/app/cart/actions');
const getCartMock = vi.mocked(getCart);

const LAMBDA = 'https://example.lambda-url.us-east-1.on.aws';
const mockFetch = vi.fn();

const INPUT = {
  totalPrice: 100,
  items: [{ productId: '12345', price: 50, quantity: 2 }],
};

/** A well-formed lambda response for the $1.50 tier. */
function quoteResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      statusCode: 200,
      data: { variant_id: '46569521702021', price: '1.50', widget_display_status: false },
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.stubEnv('NAVIDIUM_API_URL', LAMBDA);
  vi.stubEnv('NAVIDIUM_SHOP_URL', '');
  vi.stubEnv('NAVIDIUM_COUNTRY_NAME', '');
  vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'aeipron.myshopify.com');
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(quoteResponse());
  vi.stubGlobal('fetch', mockFetch);
  getCartMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getProtectionQuote — configuration', () => {
  it('returns null without calling fetch when NAVIDIUM_API_URL is unset', async () => {
    vi.stubEnv('NAVIDIUM_API_URL', '');
    const quote = await getProtectionQuote(INPUT);
    expect(quote).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when no shop url is configured', async () => {
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', '');
    const quote = await getProtectionQuote(INPUT);
    expect(quote).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('getProtectionQuote — request shape', () => {
  it('POSTs the Navidium payload with defaults applied', async () => {
    await getProtectionQuote(INPUT);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(LAMBDA);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      total_price: 100,
      items: [{ product_id: '12345', price: 50, quantity: 2 }],
      country_name: 'United States',
      shop_url: 'aeipron.myshopify.com',
    });
  });

  it('prefers NAVIDIUM_SHOP_URL / NAVIDIUM_COUNTRY_NAME and forwards optional item fields', async () => {
    vi.stubEnv('NAVIDIUM_SHOP_URL', 'zk0duy-w1.myshopify.com');
    vi.stubEnv('NAVIDIUM_COUNTRY_NAME', 'Canada');
    await getProtectionQuote({
      totalPrice: 30,
      items: [{ productId: '999', price: 30, quantity: 1, productType: 'Hoodie', sku: 'hd-1' }],
      countryName: 'United States',
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    // Explicit countryName argument wins over the env default.
    expect(body.country_name).toBe('United States');
    expect(body.shop_url).toBe('zk0duy-w1.myshopify.com');
    expect(body.items[0]).toEqual({ product_id: '999', price: 30, quantity: 1, product_type: 'Hoodie', sku: 'hd-1' });
  });
});

describe('getProtectionQuote — response handling', () => {
  it('maps a valid response to a variant GID and numeric price', async () => {
    const quote = await getProtectionQuote(INPUT);
    expect(quote).toEqual({ variantId: 'gid://shopify/ProductVariant/46569521702021', price: 1.5 });
  });

  it('returns null on a non-200 HTTP status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    expect(await getProtectionQuote(INPUT)).toBeNull();
  });

  it('returns null on a network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('socket hang up'));
    expect(await getProtectionQuote(INPUT)).toBeNull();
  });

  it('returns null when the variant id is not numeric', async () => {
    mockFetch.mockResolvedValueOnce(quoteResponse({ data: { variant_id: 'abc', price: '1.50' } }));
    expect(await getProtectionQuote(INPUT)).toBeNull();
  });

  it('returns null when the price is not a finite number', async () => {
    mockFetch.mockResolvedValueOnce(quoteResponse({ data: { variant_id: '123', price: 'free' } }));
    expect(await getProtectionQuote(INPUT)).toBeNull();
  });

  it('returns null when the response carries no data object', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ statusCode: 200 }) });
    expect(await getProtectionQuote(INPUT)).toBeNull();
  });
});

describe('getShippingProtectionQuote — server-side cart pricing', () => {
  const line = (overrides: Partial<CartLine>): CartLine => ({
    lineId: 'gid://shopify/CartLine/1',
    merchandiseId: 'gid://shopify/ProductVariant/111',
    name: 'The Heavyweight Hoodie',
    productHandle: 'hoodie',
    price: 150,
    variantLabel: 'Black / large',
    quantity: 1,
    image: '',
    currencyCode: 'USD',
    ...overrides,
  });

  const cartWith = (lines: CartLine[]): Cart => ({
    totalQuantity: lines.reduce((acc, l) => acc + l.quantity, 0),
    checkoutUrl: 'https://shop.example/checkout',
    subtotalAmount: 0,
    totalAmount: 0,
    totalAmountEstimated: false,
    currencyCode: 'USD',
    lines,
  });

  it('derives lines and prices from the server cart, excluding the protection line', async () => {
    getCartMock.mockResolvedValue(
      cartWith([
        line({ merchandiseId: 'gid://shopify/ProductVariant/111', price: 19.99, quantity: 3 }),
        line({ merchandiseId: 'gid://shopify/ProductVariant/222', price: 0.01, quantity: 1 }),
        // Navidium's own protection line must not count into the tier:
        line({ name: 'Navidium Shipping Protection', productHandle: 'navidium-shipping-protection', price: 1.5 }),
      ]),
    );

    const quote = await getShippingProtectionQuote({ countryName: 'Canada' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    // 19.99*3 + 0.01 = 59.98 — from Shopify's prices, protection line excluded,
    // rounded to cents with no float drift.
    expect(body.total_price).toBe(59.98);
    expect(body.country_name).toBe('Canada');
    expect(body.items).toEqual([
      { product_id: '111', price: 19.99, quantity: 3 },
      { product_id: '222', price: 0.01, quantity: 1 },
    ]);
    expect(quote).not.toBeNull();
  });

  it('ignores any lines a crafted request tries to inject', async () => {
    getCartMock.mockResolvedValue(cartWith([line({ price: 300, quantity: 1 })]));

    // A forged payload claiming a near-empty, near-free cart:
    const forged = {
      lines: [{ merchandiseId: 'gid://shopify/ProductVariant/1', price: 0.01, quantity: 1 }],
    } as unknown as Parameters<typeof getShippingProtectionQuote>[0];
    await getShippingProtectionQuote(forged);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.total_price).toBe(300); // the SERVER cart's value, not 0.01
    expect(body.items).toEqual([{ product_id: '111', price: 300, quantity: 1 }]);
  });

  it('returns null without calling Navidium when there is no usable cart', async () => {
    getCartMock.mockResolvedValue(null); // no cart cookie / expired cart
    expect(await getShippingProtectionQuote()).toBeNull();

    getCartMock.mockResolvedValue(cartWith([])); // empty merchandise
    expect(await getShippingProtectionQuote()).toBeNull();

    getCartMock.mockResolvedValue(
      cartWith([line({ name: 'Navidium Shipping Protection', productHandle: 'navidium-shipping-protection' })]),
    ); // protection-only cart
    expect(await getShippingProtectionQuote()).toBeNull();

    getCartMock.mockRejectedValue(new Error('shopify down')); // transport failure
    expect(await getShippingProtectionQuote()).toBeNull();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // The store's protection fee is a FLAT $4.95 (Navidium dashboard config).
  // The lambda can keep answering with the old tiered price ($1.00) after a
  // dashboard change, so the action pins the advertised price — the variant
  // id still comes from Navidium, the price never does.
  it('pins the quote price to the flat $4.95 fee regardless of the lambda price', async () => {
    getCartMock.mockResolvedValue(cartWith([line({})]));
    // Default lambda mock answers price '1.50' — the stale tier.
    const quote = await getShippingProtectionQuote();
    expect(quote).not.toBeNull();
    expect(quote?.price).toBe(4.95);
    expect(quote?.variantId).toBe('gid://shopify/ProductVariant/46569521702021');
  });

  it('honors NAVIDIUM_FIXED_FEE when the flat fee changes', async () => {
    vi.stubEnv('NAVIDIUM_FIXED_FEE', '5.95');
    getCartMock.mockResolvedValue(cartWith([line({})]));
    const quote = await getShippingProtectionQuote();
    expect(quote?.price).toBe(5.95);
  });
});
