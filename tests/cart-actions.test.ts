import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Cart server-action tests.
//
// The actions orchestrate: cookie read/write (mocked), the Shopify Cart API
// (mocked), and Zustand reconciliation (mocked). These tests verify the
// decision logic — NOT the network. Mocks:
//   - 'server-only'          → no-op (it throws outside server components)
//   - '@/lib/cart-cookie'    → in-memory get/set/clear spies
//   - '@/lib/shopify/client' → shopifyRequest returns canned cart payloads
//   - '@/store/use-cart'     → useCart.getState() spy
//
// `next/cache` revalidatePath is a no-op in the action, so it needs no mock.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

const mockGetCartId = vi.fn<() => Promise<string | null>>();
const mockSetCartId = vi.fn<(id: string) => Promise<void>>();
const mockClearCartId = vi.fn<() => Promise<void>>();

vi.mock('@/lib/cart-cookie', () => ({
  getCartId: () => mockGetCartId(),
  setCartId: (id: string) => mockSetCartId(id),
  clearCartId: () => mockClearCartId(),
  CART_COOKIE: 'apeiron-cart-id',
}));

const mockShopifyRequest = vi.fn();
vi.mock('@/lib/shopify/client', () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
  ShopifyClientError: class ShopifyClientError extends Error {},
}));

const mockSetItems = vi.fn();
vi.mock('@/store/use-cart', () => ({
  useCart: {
    getState: () => ({ setItems: mockSetItems }),
  },
}));

// Import AFTER mocks are registered.
const {
  addToCart,
  updateCartLine,
  removeCartLine,
  getCart,
  getCheckoutUrl,
} = await import('@/app/cart/actions');
const { CART_GET_QUERY, CART_CREATE_MUTATION, CART_LINES_ADD_MUTATION, CART_LINES_UPDATE_MUTATION, CART_LINES_REMOVE_MUTATION } =
  await import('@/lib/shopify/queries');

// ---- Canned Shopify payloads (minimal but shape-correct) -------------------

const VARIANT_GID = 'gid://shopify/ProductVariant/111';
const CART_ID = 'gid://shopify/Cart/abc?key=secret';
const LINE_GID = 'gid://shopify/CartLine/xyz';

function shopifyCart(overrides: Record<string, unknown> = {}) {
  return {
    id: CART_ID,
    totalQuantity: 1,
    checkoutUrl: 'https://aeipron.myshopify.com/cart/c/abc?key=secret',
    cost: {
      subtotalAmount: { amount: '120.0', currencyCode: 'USD' },
      totalAmount: { amount: '120.0', currencyCode: 'USD' },
      totalAmountEstimated: true,
    },
    lines: {
      edges: [
        {
          node: {
            id: LINE_GID,
            quantity: 1,
            cost: {
              amountPerQuantity: { amount: '120.0', currencyCode: 'USD' },
              totalAmount: { amount: '120.0', currencyCode: 'USD' },
            },
            merchandise: {
              id: VARIANT_GID,
              title: 'Black / XL',
              price: { amount: '120.0', currencyCode: 'USD' },
              image: { url: 'https://cdn.shopify.com/img.png', altText: null },
              selectedOptions: [
                { name: 'Color', value: 'Black' },
                { name: 'Size', value: 'XL' },
              ],
              product: { title: 'Apeiron Hoodie', handle: 'apeiron-hoodie' },
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCartId.mockResolvedValue(null);
});

describe('addToCart', () => {
  it('rejects a merchandiseId that is not a ProductVariant GID before any Shopify call', async () => {
    const result = await addToCart({ merchandiseId: 'not-a-gid', quantity: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('That variant is unavailable. Please refresh and try again.');
    expect(mockShopifyRequest).not.toHaveBeenCalled();
    expect(mockSetCartId).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity', async () => {
    const result = await addToCart({ merchandiseId: VARIANT_GID, quantity: 0 });
    expect(result.ok).toBe(false);
    expect(mockShopifyRequest).not.toHaveBeenCalled();
  });

  it('creates a NEW cart (cartCreate) when no cookie cart id exists, then stores the id', async () => {
    mockShopifyRequest.mockResolvedValue({ cartCreate: { cart: shopifyCart(), userErrors: [] } });

    const result = await addToCart({ merchandiseId: VARIANT_GID, quantity: 2 });

    expect(result.ok).toBe(true);
    // cartCreate used (not cartLinesAdd).
    expect(mockShopifyRequest).toHaveBeenCalledWith(
      CART_CREATE_MUTATION,
      { input: { lines: [{ merchandiseId: VARIANT_GID, quantity: 2 }] } },
    );
    // The FULL cart id (incl. ?key=) is persisted verbatim to the cookie.
    expect(mockSetCartId).toHaveBeenCalledWith(CART_ID);
    // The Zustand store is reconciled from the Shopify response.
    expect(mockSetItems).toHaveBeenCalledTimes(1);
  });

  it('adds to the EXISTING cart (cartLinesAdd) when a cookie cart id exists', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cartLinesAdd: { cart: shopifyCart(), userErrors: [] } });

    const result = await addToCart({ merchandiseId: VARIANT_GID, quantity: 1 });

    expect(result.ok).toBe(true);
    expect(mockShopifyRequest).toHaveBeenCalledWith(
      CART_LINES_ADD_MUTATION,
      { cartId: CART_ID, lines: [{ merchandiseId: VARIANT_GID, quantity: 1 }] },
    );
    // The cookie is NOT rewritten (the cart id did not change).
    expect(mockSetCartId).not.toHaveBeenCalled();
  });

  it('maps userErrors to a generic, non-leaking error', async () => {
    mockShopifyRequest.mockResolvedValue({
      cartCreate: {
        cart: null,
        userErrors: [{ field: ['lines', '0', 'merchandiseId'], message: 'Merchandise does not exist' }],
      },
    });

    const result = await addToCart({ merchandiseId: VARIANT_GID, quantity: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Generic message — does NOT leak the Shopify error text.
      expect(result.error).toBe('Your bag could not be updated. Please try again.');
      expect(result.error).not.toContain('Merchandise');
    }
    // A failed create must NOT persist a cart id.
    expect(mockSetCartId).not.toHaveBeenCalled();
  });

  it('clears the cookie and reports when the existing cart has EXPIRED', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cartLinesAdd: { cart: null, userErrors: [] } });

    const result = await addToCart({ merchandiseId: VARIANT_GID, quantity: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Your bag expired. Please try again.');
    // The stale cookie is cleared so the next add creates a fresh cart.
    expect(mockClearCartId).toHaveBeenCalledTimes(1);
  });
});

describe('updateCartLine', () => {
  it('calls cartLinesUpdate with the line GID and quantity', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cartLinesUpdate: { cart: shopifyCart(), userErrors: [] } });

    const result = await updateCartLine({ lineId: LINE_GID, quantity: 3 });

    expect(result.ok).toBe(true);
    expect(mockShopifyRequest).toHaveBeenCalledWith(
      CART_LINES_UPDATE_MUTATION,
      { cartId: CART_ID, lines: [{ id: LINE_GID, quantity: 3 }] },
    );
    expect(mockSetItems).toHaveBeenCalledTimes(1);
  });

  it('routes quantity <= 0 to cartLinesRemove instead of cartLinesUpdate', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cartLinesRemove: { cart: shopifyCart({ totalQuantity: 0, lines: { edges: [] } }), userErrors: [] } });

    const result = await updateCartLine({ lineId: LINE_GID, quantity: 0 });

    expect(result.ok).toBe(true);
    expect(mockShopifyRequest).toHaveBeenCalledWith(
      CART_LINES_REMOVE_MUTATION,
      { cartId: CART_ID, lineIds: [LINE_GID] },
    );
  });

  it('rejects a lineId that is not a cart-line GID', async () => {
    const result = await updateCartLine({ lineId: VARIANT_GID, quantity: 2 });
    expect(result.ok).toBe(false);
    expect(mockShopifyRequest).not.toHaveBeenCalled();
  });

  it('returns ok:false gracefully when there is no cart cookie', async () => {
    const result = await updateCartLine({ lineId: LINE_GID, quantity: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Your bag may have changed — please refresh the page.');
    expect(mockShopifyRequest).not.toHaveBeenCalled();
  });
});

describe('removeCartLine', () => {
  it('calls cartLinesRemove with the line GID', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cartLinesRemove: { cart: shopifyCart({ totalQuantity: 0, lines: { edges: [] } }), userErrors: [] } });

    const result = await removeCartLine({ lineId: LINE_GID });

    expect(result.ok).toBe(true);
    expect(mockShopifyRequest).toHaveBeenCalledWith(
      CART_LINES_REMOVE_MUTATION,
      { cartId: CART_ID, lineIds: [LINE_GID] },
    );
  });
});

describe('getCart', () => {
  it('returns null when there is no cookie cart id', async () => {
    await expect(getCart()).resolves.toBeNull();
    expect(mockShopifyRequest).not.toHaveBeenCalled();
  });

  it('returns the mapped cart when Shopify finds it', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cart: shopifyCart() });

    const cart = await getCart();
    expect(cart).not.toBeNull();
    expect(mockShopifyRequest).toHaveBeenCalledWith(CART_GET_QUERY, { id: CART_ID });
    expect(cart?.totalQuantity).toBe(1);
  });

  it('clears the cookie and returns null when the cart expired at Shopify', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cart: null });

    await expect(getCart()).resolves.toBeNull();
    expect(mockClearCartId).toHaveBeenCalledTimes(1);
  });

  it('returns null (and keeps the cookie) when the Shopify call throws', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockRejectedValue(new Error('network down'));

    await expect(getCart()).resolves.toBeNull();
    // A transient failure must NOT clear the shopper's cart cookie.
    expect(mockClearCartId).not.toHaveBeenCalled();
  });
});

describe('getCheckoutUrl', () => {
  it('returns null when there is no cart', async () => {
    await expect(getCheckoutUrl()).resolves.toBeNull();
  });

  it('returns the checkoutUrl verbatim from Shopify', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cart: shopifyCart() });

    await expect(getCheckoutUrl()).resolves.toBe('https://aeipron.myshopify.com/cart/c/abc?key=secret');
  });

  it('returns null when the cart has no checkoutUrl yet', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockShopifyRequest.mockResolvedValue({ cart: { ...shopifyCart(), checkoutUrl: null } });

    await expect(getCheckoutUrl()).resolves.toBeNull();
  });
});
