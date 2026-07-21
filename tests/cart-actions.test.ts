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
  CART_COOKIE: 'apeiron-cart-id',
}));

// The adapter (mapCart) is a real pure function — let it run on fixture-shaped
// responses so we also assert the action returns the correctly-mapped Cart.
const { getCart, addToCart, updateCartLine, removeCartLine, clearCart, getCheckoutUrl } =
  await import('@/app/cart/actions');
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

const CART_ID = 'gid://shopify/Cart/test0001?key=testkey';
const MERCH_ID = 'gid://shopify/ProductVariant/46514157256901';
const LINE_ID = 'gid://shopify/CartLine/abc123';

const mockRequest = vi.mocked(shopifyRequest);
const mockGetCartId = vi.mocked(getCartId);
const mockSetCartId = vi.mocked(setCartId);
const mockClearCartId = vi.mocked(clearCartId);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequest.mockReset();
  mockGetCartId.mockReset();
  mockGetCartId.mockResolvedValue(null);
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