import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Navidium shipping-protection tests.
//
// lib/navidium.ts (quote client) and app/cart/protection.ts (server action)
// are covered together: env configuration, the exact request payload, response
// validation (numeric variant id, finite price), the never-throws contract,
// and the action's input validation + tier-total arithmetic. `fetch` is mocked
// so nothing hits the network.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

const { getProtectionQuote } = await import('@/lib/navidium');
const { getShippingProtectionQuote } = await import('@/app/cart/protection');

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

describe('getShippingProtectionQuote — action validation', () => {
  const lines = [
    { merchandiseId: 'gid://shopify/ProductVariant/46569521709253', price: 30, quantity: 1 },
  ];

  it('computes the tier total and maps GIDs to numeric product ids', async () => {
    const quote = await getShippingProtectionQuote({
      lines: [
        { merchandiseId: 'gid://shopify/ProductVariant/111', price: 19.99, quantity: 3 },
        { merchandiseId: 'gid://shopify/ProductVariant/222', price: 0.01, quantity: 1 },
      ],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    // 19.99*3 + 0.01 = 59.98 — rounded to cents, no float drift.
    expect(body.total_price).toBe(59.98);
    expect(body.items[0].product_id).toBe('111');
    expect(quote).not.toBeNull();
  });

  it('rejects invalid lines without calling Navidium', async () => {
    expect(
      await getShippingProtectionQuote({ lines: [{ merchandiseId: 'x', price: -1, quantity: 1 }] }),
    ).toBeNull();
    expect(
      await getShippingProtectionQuote({ lines: [{ merchandiseId: 'x', price: 1, quantity: 0 }] }),
    ).toBeNull();
    expect(
      await getShippingProtectionQuote({ lines: [{ merchandiseId: 'x', price: 1, quantity: 1.5 }] }),
    ).toBeNull();
    expect(await getShippingProtectionQuote({ lines: [] })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects an unbounded line count', async () => {
    const many = Array.from({ length: 251 }, () => lines[0]);
    expect(await getShippingProtectionQuote({ lines: many })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
