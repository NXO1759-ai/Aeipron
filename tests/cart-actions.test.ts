import { describe, it, expect, beforeEach, vi } from 'vitest';

// actions.ts transitively imports 'server-only' (via lib/shopify/adapter +
// lib/shopify/queries + lib/shopify/client). Under Vitest its default export
// throws, so mock it to an empty module. (The client is mocked separately
// below, but adapter/queries still load for real and carry the guard.)
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Cart server action tests.
//
// The actions are the ONLY way the client mutates cart state. They own the
// cookie lifecycle and return the authoritative domain `Cart`. These tests mock
// `shopifyRequest` (no live Shopify) and `lib/cart-cookie` (no next/headers) and
// drive every action through its branches:
//   - getCart: no cookie / live cart / expired cart (null → clear + null)
//   - addToCart: create path / add path / expired-cart recovery / userErrors /
//     input validation
//   - updateCartLine: update / quantity≤0 → remove / userErrors / validation
//   - removeCartLine / clearCart / getCheckoutUrl
//
// CRITICAL invariant under test: the browser NEVER sends a price. Every
// mutation variables object is inspected to prove it carries only
// merchandiseId/quantity/cartId/lineId/lineIds — never a `price` field.
// ---------------------------------------------------------------------------

// Mock the Shopify client so actions never hit the network. Providing
// `ShopifyClientError` keeps the actions' `instanceof` checks type-compatible.
vi.mock('@/lib/shopify/client', () => ({
  shopifyRequest: vi.fn(),
  ShopifyClientError: class ShopifyClientError extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
      this.name = 'ShopifyClientError';
    }
  },
}));

// Mock the cookie helper so next/headers / server-only never load here.
vi.mock('@/lib/cart-cookie', () => ({
  getCartId: vi.fn(),
  setCartId: vi.fn(),
  clearCartId: vi.fn(),
  CART_COOKIE: 'aeipron-cart-id',
}));

// Mock the shipping-protection server read so getProtectionConfig never hits
// Shopify (it is exercised directly in tests/shipping-protection-read.test.ts).
vi.mock('@/lib/shipping-protection', () => ({
  getProtectionConfig: vi.fn(),
}));

// The adapter (mapCart) is a real pure function — let it run on fixture-shaped
// responses so we also assert the action returns the correctly-mapped Cart.
const {
  getCart,
  addToCart,
  updateCartLine,
  removeCartLine,
  clearCart,
  getCheckoutUrl,
  getProtectionConfig,
  swapShippingProtection,
} = await import('@/app/cart/actions');
const { shopifyRequest } = await import('@/lib/shopify/client');
const { getCartId, setCartId, clearCartId } = await import('@/lib/cart-cookie');
const {
  CART_GET_QUERY,
  CART_CREATE_MUTATION,
  CART_LINES_ADD_MUTATION,
  CART_LINES_UPDATE_MUTATION,
  CART_LINES_REMOVE_MUTATION,
} = await import('@/lib/shopify/queries');
const { singleLineCartNode, emptyCartNode } = await import('./fixtures/cart-node');
const { mapCart } = await import('@/lib/shopify/adapter');
const { getProtectionConfig: readProtectionConfig } = await import('@/lib/shipping-protection');

const CART_ID = 'gid://shopify/Cart/test0001?key=testkey';
const MERCH_ID = 'gid://shopify/ProductVariant/46514157256901';
const LINE_ID = 'gid://shopify/CartLine/abc123';
const PROTECTION_MERCH_ID = 'gid://shopify/ProductVariant/10000000000010';

const mockRequest = vi.mocked(shopifyRequest);
const mockGetCartId = vi.mocked(getCartId);
const mockSetCartId = vi.mocked(setCartId);
const mockClearCartId = vi.mocked(clearCartId);
const mockReadProtectionConfig = vi.mocked(readProtectionConfig);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequest.mockReset();
  mockGetCartId.mockReset();
  mockGetCartId.mockResolvedValue(null);
  mockReadProtectionConfig.mockReset();
});

// ---------------------------------------------------------------------------
// getCart
// ---------------------------------------------------------------------------

describe('getCart', () => {
  it('returns null and does not call Shopify when there is no cart cookie', async () => {
    const cart = await getCart();
    expect(cart).toBeNull();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('reads the cart with CART_GET_QUERY and returns the mapped cart', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({ cart: singleLineCartNode });
    const cart = await getCart();
    expect(shopifyRequest).toHaveBeenCalledWith(CART_GET_QUERY, { id: CART_ID });
    expect(cart).toEqual(mapCart(singleLineCartNode));
  });

  it('clears the cookie and returns null when the cart has expired (cart: null)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({ cart: null });
    const cart = await getCart();
    expect(cart).toBeNull();
    expect(mockClearCartId.mock.calls).toHaveLength(1);
  });

  it('passes the opaque cart id verbatim (never parses the ?key= secret)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({ cart: singleLineCartNode });
    await getCart();
    const [, vars] = mockRequest.mock.calls[0];
    expect(vars).toEqual({ id: CART_ID });
    expect((vars as { id: string }).id).toContain('?key=');
  });
});

// ---------------------------------------------------------------------------
// addToCart
// ---------------------------------------------------------------------------

describe('addToCart', () => {
  it('creates a new cart (cartCreate) when there is no cookie, and stores the returned id', async () => {
    mockGetCartId.mockResolvedValue(null);
    mockRequest.mockResolvedValue({
      cartCreate: { cart: singleLineCartNode, userErrors: [] },
    });
    const cart = await addToCart({ merchandiseId: MERCH_ID, quantity: 2 });
    expect(shopifyRequest).toHaveBeenCalledWith(CART_CREATE_MUTATION, {
      input: { lines: [{ merchandiseId: MERCH_ID, quantity: 2 }] },
    });
    expect(mockSetCartId.mock.calls).toEqual([[singleLineCartNode.id]]);
    expect(cart).toEqual(mapCart(singleLineCartNode));
  });

  it('adds to the existing cart (cartLinesAdd) when a cookie exists, and does NOT reset the cookie', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({
      cartLinesAdd: { cart: singleLineCartNode, userErrors: [] },
    });
    const cart = await addToCart({ merchandiseId: MERCH_ID, quantity: 1 });
    expect(shopifyRequest).toHaveBeenCalledWith(CART_LINES_ADD_MUTATION, {
      cartId: CART_ID,
      lines: [{ merchandiseId: MERCH_ID, quantity: 1 }],
    });
    expect(mockSetCartId.mock.calls).toHaveLength(0);
    expect(cart).toEqual(mapCart(singleLineCartNode));
  });

  it('recovers from an expired cart: cartLinesAdd returns cart:null → clears cookie, creates a fresh cart', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({ cartLinesAdd: { cart: null, userErrors: [] } });
    mockRequest.mockResolvedValueOnce({
      cartCreate: { cart: singleLineCartNode, userErrors: [] },
    });
    const cart = await addToCart({ merchandiseId: MERCH_ID, quantity: 1 });
    expect(mockClearCartId.mock.calls).toHaveLength(1);
    // Second call should be the create.
    expect(mockRequest.mock.calls[1][0]).toBe(CART_CREATE_MUTATION);
    expect(mockSetCartId.mock.calls).toEqual([[singleLineCartNode.id]]);
    expect(cart).toEqual(mapCart(singleLineCartNode));
  });

  it('throws a NON-LEAKING error on cartCreate userErrors (no GraphQL detail in the message)', async () => {
    mockGetCartId.mockResolvedValue(null);
    mockRequest.mockResolvedValue({
      cartCreate: {
        cart: null,
        userErrors: [{ field: ['lines', '0', 'merchandiseId'], message: 'ProductVariant 999 does not exist' }],
      },
    });
    await expect(addToCart({ merchandiseId: 'gid://shopify/ProductVariant/999', quantity: 1 })).rejects.toThrow();
    try {
      await addToCart({ merchandiseId: 'gid://shopify/ProductVariant/999', quantity: 1 });
    } catch (e) {
      expect((e as Error).message).not.toContain('ProductVariant');
      expect((e as Error).message).not.toContain('999');
    }
  });

  it('throws on cartLinesAdd userErrors (existing-cart path)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({
      cartLinesAdd: { cart: null, userErrors: [{ field: ['cartId'], message: 'cart does not exist' }] },
    });
    // cart:null with userErrors → the action throws (does NOT silently recover).
    await expect(addToCart({ merchandiseId: MERCH_ID, quantity: 1 })).rejects.toThrow();
  });

  it('rejects an empty merchandiseId', async () => {
    await expect(addToCart({ merchandiseId: '', quantity: 1 })).rejects.toThrow();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('rejects a non-positive / non-integer quantity', async () => {
    mockGetCartId.mockResolvedValue(null);
    for (const bad of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(addToCart({ merchandiseId: MERCH_ID, quantity: bad })).rejects.toThrow();
    }
    expect(shopifyRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateCartLine
// ---------------------------------------------------------------------------

describe('updateCartLine', () => {
  it('calls cartLinesUpdate with the cart-line GID when quantity ≥ 1', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({
      cartLinesUpdate: { cart: singleLineCartNode, userErrors: [] },
    });
    await updateCartLine({ lineId: LINE_ID, quantity: 3 });
    expect(shopifyRequest).toHaveBeenCalledWith(CART_LINES_UPDATE_MUTATION, {
      cartId: CART_ID,
      lines: [{ id: LINE_ID, quantity: 3 }],
    });
  });

  it('routes quantity ≤ 0 to cartLinesRemove (drops the line)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({
      cartLinesRemove: { cart: emptyCartNode, userErrors: [] },
    });
    await updateCartLine({ lineId: LINE_ID, quantity: 0 });
    expect(shopifyRequest).toHaveBeenCalledWith(CART_LINES_REMOVE_MUTATION, {
      cartId: CART_ID,
      lineIds: [LINE_ID],
    });
    // Must NOT have called the update mutation.
    const calledQueries = mockRequest.mock.calls.map((c) => c[0]);
    expect(calledQueries).not.toContain(CART_LINES_UPDATE_MUTATION);
  });

  it('routes negative quantity to cartLinesRemove as well', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({
      cartLinesRemove: { cart: emptyCartNode, userErrors: [] },
    });
    await updateCartLine({ lineId: LINE_ID, quantity: -5 });
    expect(shopifyRequest).toHaveBeenCalledWith(CART_LINES_REMOVE_MUTATION, {
      cartId: CART_ID,
      lineIds: [LINE_ID],
    });
  });

  it('throws a non-leaking error on userErrors', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({
      cartLinesUpdate: {
        cart: null,
        userErrors: [{ field: ['lines', '0'], message: 'line not found gid://shopify/CartLine/xyz' }],
      },
    });
    await expect(updateCartLine({ lineId: LINE_ID, quantity: 2 })).rejects.toThrow();
    try {
      await updateCartLine({ lineId: LINE_ID, quantity: 2 });
    } catch (e) {
      expect((e as Error).message).not.toContain('line not found');
    }
  });

  it('rejects an empty lineId', async () => {
    await expect(updateCartLine({ lineId: '', quantity: 2 })).rejects.toThrow();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('rejects a non-finite quantity', async () => {
    await expect(updateCartLine({ lineId: LINE_ID, quantity: Number.NaN })).rejects.toThrow();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeCartLine
// ---------------------------------------------------------------------------

describe('removeCartLine', () => {
  it('calls cartLinesRemove with the cart-line GID', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({
      cartLinesRemove: { cart: emptyCartNode, userErrors: [] },
    });
    const cart = await removeCartLine({ lineId: LINE_ID });
    expect(shopifyRequest).toHaveBeenCalledWith(CART_LINES_REMOVE_MUTATION, {
      cartId: CART_ID,
      lineIds: [LINE_ID],
    });
    expect(cart).toEqual(mapCart(emptyCartNode));
  });

  it('rejects an empty lineId', async () => {
    await expect(removeCartLine({ lineId: '' })).rejects.toThrow();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('treats "merchandise line … does not exist" as idempotent success (re-fetch, no throw)', async () => {
    // The line is already gone (a prior/concurrent op removed it, or the cached
    // line id is stale from an expired cart) — the desired end state. Instead of
    // surfacing a 500, re-fetch the authoritative cart and return it.
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartLinesRemove: {
        cart: null,
        userErrors: [
          { field: ['lineIds', '0'], message: 'The merchandise line with id 06a381d9-... does not exist.' },
        ],
      },
    });
    mockRequest.mockResolvedValueOnce({ cart: singleLineCartNode }); // the getCart re-fetch
    const cart = await removeCartLine({ lineId: LINE_ID });
    expect(cart).toEqual(mapCart(singleLineCartNode));
    // Second call was the CART_GET_QUERY re-fetch.
    expect(mockRequest.mock.calls[1][0]).toBe(CART_GET_QUERY);
  });

  it('still throws for a non-"does not exist" userError (a real failure)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartLinesRemove: { cart: null, userErrors: [{ field: ['lineIds'], message: 'line not found' }] },
    });
    await expect(removeCartLine({ lineId: LINE_ID })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// clearCart
// ---------------------------------------------------------------------------

describe('clearCart', () => {
  it('clears the cookie and does not call Shopify (cache clearing is the store job)', async () => {
    await clearCart();
    expect(mockClearCartId.mock.calls).toHaveLength(1);
    expect(shopifyRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCheckoutUrl
// ---------------------------------------------------------------------------

describe('getCheckoutUrl', () => {
  it('returns null when there is no cart cookie', async () => {
    const url = await getCheckoutUrl();
    expect(url).toBeNull();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('returns the Shopify checkoutUrl for a live cart', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({ cart: singleLineCartNode });
    const url = await getCheckoutUrl();
    expect(url).toBe(singleLineCartNode.checkoutUrl);
    expect(url).toContain('.myshopify.com/cart/c/');
  });

  it('clears the cookie and returns null when the cart has expired', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({ cart: null });
    const url = await getCheckoutUrl();
    expect(url).toBeNull();
    expect(mockClearCartId.mock.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The price invariant: no mutation ever sends a price to Shopify.
// ---------------------------------------------------------------------------

describe('price invariant — no mutation payload ever contains a price', () => {
  it('addToCart (create) sends only merchandiseId + quantity per line', async () => {
    mockGetCartId.mockResolvedValue(null);
    mockRequest.mockResolvedValue({ cartCreate: { cart: singleLineCartNode, userErrors: [] } });
    await addToCart({ merchandiseId: MERCH_ID, quantity: 2 });
    const [, vars] = mockRequest.mock.calls[0];
    const line = (vars as { input: { lines: unknown[] } }).input.lines[0] as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual(['merchandiseId', 'quantity']);
    expect(line).not.toHaveProperty('price');
  });

  it('addToCart (add) sends only merchandiseId + quantity per line', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({ cartLinesAdd: { cart: singleLineCartNode, userErrors: [] } });
    await addToCart({ merchandiseId: MERCH_ID, quantity: 1 });
    const [, vars] = mockRequest.mock.calls[0];
    const line = (vars as { lines: unknown[] }).lines[0] as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual(['merchandiseId', 'quantity']);
  });

  it('updateCartLine sends only id + quantity (no price)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({ cartLinesUpdate: { cart: singleLineCartNode, userErrors: [] } });
    await updateCartLine({ lineId: LINE_ID, quantity: 3 });
    const [, vars] = mockRequest.mock.calls[0];
    const line = (vars as { lines: unknown[] }).lines[0] as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual(['id', 'quantity']);
  });

  it('no variables object across any mutation contains a price key', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValue({ cartLinesUpdate: { cart: singleLineCartNode, userErrors: [] } });
    await updateCartLine({ lineId: LINE_ID, quantity: 3 });
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ cartLinesRemove: { cart: emptyCartNode, userErrors: [] } });
    await removeCartLine({ lineId: LINE_ID });

    for (const [, vars] of mockRequest.mock.calls) {
      const json = JSON.stringify(vars);
      expect(json).not.toContain('"price"');
      expect(json).not.toContain('"amount"');
    }
  });
});

// ---------------------------------------------------------------------------
// getProtectionConfig
// ---------------------------------------------------------------------------

describe('getProtectionConfig', () => {
  it('delegates to the shipping-protection server read and returns its result', async () => {
    mockReadProtectionConfig.mockResolvedValue({
      variants: [{ id: PROTECTION_MERCH_ID, title: '4.03', price: 4.03 }],
      rate: 0.02,
    });
    const cfg = await getProtectionConfig();
    expect(mockReadProtectionConfig).toHaveBeenCalledTimes(1);
    expect(cfg).toEqual({
      variants: [{ id: PROTECTION_MERCH_ID, title: '4.03', price: 4.03 }],
      rate: 0.02,
    });
  });

  it('returns null when the protection product is not visible to the Storefront API', async () => {
    mockReadProtectionConfig.mockResolvedValue(null);
    const cfg = await getProtectionConfig();
    expect(cfg).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// swapShippingProtection
// ---------------------------------------------------------------------------

describe('swapShippingProtection', () => {
  it('removes the old protection line then adds the new variant (qty 1)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({ cartLinesRemove: { cart: emptyCartNode, userErrors: [] } });
    mockRequest.mockResolvedValueOnce({ cartLinesAdd: { cart: singleLineCartNode, userErrors: [] } });
    const cart = await swapShippingProtection({ oldLineId: LINE_ID, newMerchandiseId: PROTECTION_MERCH_ID });
    // First call: remove the old line.
    expect(mockRequest.mock.calls[0][0]).toBe(CART_LINES_REMOVE_MUTATION);
    expect(mockRequest.mock.calls[0][1]).toEqual({ cartId: CART_ID, lineIds: [LINE_ID] });
    // Second call: add the new variant, qty 1.
    expect(mockRequest.mock.calls[1][0]).toBe(CART_LINES_ADD_MUTATION);
    expect(mockRequest.mock.calls[1][1]).toEqual({
      cartId: CART_ID,
      lines: [{ merchandiseId: PROTECTION_MERCH_ID, quantity: 1 }],
    });
    expect(cart).toEqual(mapCart(singleLineCartNode));
  });

  it('throws and does NOT add the new variant when the remove fails (userErrors)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartLinesRemove: { cart: null, userErrors: [{ field: ['lineIds'], message: 'line not found' }] },
    });
    await expect(
      swapShippingProtection({ oldLineId: LINE_ID, newMerchandiseId: PROTECTION_MERCH_ID }),
    ).rejects.toThrow();
    // Only the remove call happened — the add never ran.
    expect(mockRequest.mock.calls).toHaveLength(1);
  });

  it('proceeds to add the new tier when the old line is already gone ("does not exist")', async () => {
    // The remove step's "merchandise line … does not exist" is idempotent
    // success (the line is already gone), so the swap continues to add the new
    // tier rather than aborting — no 500, cart ends with the new variant.
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartLinesRemove: {
        cart: null,
        userErrors: [
          { field: ['lineIds', '0'], message: 'The merchandise line with id 06a381d9-... does not exist.' },
        ],
      },
    });
    mockRequest.mockResolvedValueOnce({ cart: singleLineCartNode }); // getCart re-fetch
    mockRequest.mockResolvedValueOnce({ cartLinesAdd: { cart: singleLineCartNode, userErrors: [] } });
    const cart = await swapShippingProtection({ oldLineId: LINE_ID, newMerchandiseId: PROTECTION_MERCH_ID });
    expect(cart).toEqual(mapCart(singleLineCartNode));
    // remove(rejected) → getCart re-fetch → add. The add still ran (new tier added).
    const mutations = mockRequest.mock.calls.map((c) => c[0]);
    expect(mutations).toContain(CART_LINES_ADD_MUTATION);
  });

  it('throws when the add fails after the remove (non-atomic — cart left without protection)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({ cartLinesRemove: { cart: emptyCartNode, userErrors: [] } });
    mockRequest.mockResolvedValueOnce({
      cartLinesAdd: { cart: null, userErrors: [{ field: ['lines'], message: 'variant unavailable' }] },
    });
    await expect(
      swapShippingProtection({ oldLineId: LINE_ID, newMerchandiseId: PROTECTION_MERCH_ID }),
    ).rejects.toThrow();
    // Both calls ran (remove succeeded, add failed) — the store will re-hydrate.
    expect(mockRequest.mock.calls).toHaveLength(2);
  });

  it('rejects an empty oldLineId or newMerchandiseId before any Shopify call', async () => {
    await expect(swapShippingProtection({ oldLineId: '', newMerchandiseId: PROTECTION_MERCH_ID })).rejects.toThrow();
    await expect(swapShippingProtection({ oldLineId: LINE_ID, newMerchandiseId: '' })).rejects.toThrow();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('never sends a price (trust invariant)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({ cartLinesRemove: { cart: emptyCartNode, userErrors: [] } });
    mockRequest.mockResolvedValueOnce({ cartLinesAdd: { cart: singleLineCartNode, userErrors: [] } });
    await swapShippingProtection({ oldLineId: LINE_ID, newMerchandiseId: PROTECTION_MERCH_ID });
    for (const [, vars] of mockRequest.mock.calls) {
      const json = JSON.stringify(vars);
      expect(json).not.toContain('"price"');
      expect(json).not.toContain('"amount"');
    }
  });
});