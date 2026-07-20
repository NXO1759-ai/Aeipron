import { describe, it, expect, beforeEach, vi } from 'vitest';

// actions.ts transitively imports 'server-only' (via the adapter / queries /
// client). Under Vitest its default export throws, so mock it to an empty module.
vi.mock('server-only', () => ({}));

// Mock the Shopify client so actions never hit the network.
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

const { updateCheckoutContact, selectDeliveryOption, getCheckoutDetails } = await import(
  '@/app/checkout/actions'
);
const { shopifyRequest } = await import('@/lib/shopify/client');
const { getCartId, clearCartId } = await import('@/lib/cart-cookie');
const {
  CART_WITH_DELIVERY_QUERY,
  CART_BUYER_IDENTITY_UPDATE_MUTATION,
  CART_DELIVERY_ADDRESSES_ADD_MUTATION,
  CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION,
} = await import('@/lib/shopify/queries');
const { mapCheckoutDetails } = await import('@/lib/shopify/adapter');
const {
  twoOptionsCartNode,
  noDeliveryFieldCartNode,
} = await import('./fixtures/checkout-cart-node');

const CART_ID = 'gid://shopify/Cart/ckout001?key=ckkey';

/** A valid form payload (US address) matching the zod schema. */
const VALID_INPUT = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+1 555 123 4567',
  address1: '123 Main St',
  address2: '',
  city: 'Springfield',
  zip: '62704',
  country: 'US',
};

const mockRequest = vi.mocked(shopifyRequest);
const mockGetCartId = vi.mocked(getCartId);
const mockClearCartId = vi.mocked(clearCartId);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequest.mockReset();
  mockGetCartId.mockReset();
  mockGetCartId.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// updateCheckoutContact
// ---------------------------------------------------------------------------

describe('updateCheckoutContact', () => {
  it('returns null without calling Shopify when there is no cart cookie', async () => {
    const out = await updateCheckoutContact(VALID_INPUT);
    expect(out).toBeNull();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('calls cartBuyerIdentityUpdate then cartDeliveryAddressesAdd and returns the mapped details', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    // First call: buyer identity (we ignore its cart; return a no-delivery cart).
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: { cart: noDeliveryFieldCartNode, userErrors: [], warnings: [] },
    });
    // Second call: delivery add → returns the cart WITH delivery groups.
    mockRequest.mockResolvedValueOnce({
      cartDeliveryAddressesAdd: { cart: twoOptionsCartNode, userErrors: [], warnings: [] },
    });

    const out = await updateCheckoutContact(VALID_INPUT);

    expect(mockRequest.mock.calls[0][0]).toBe(CART_BUYER_IDENTITY_UPDATE_MUTATION);
    expect(mockRequest.mock.calls[1][0]).toBe(CART_DELIVERY_ADDRESSES_ADD_MUTATION);
    expect(out).toEqual(mapCheckoutDetails(twoOptionsCartNode));
  });

  it('passes only email/phone/countryCode to buyer identity (no price)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: { cart: noDeliveryFieldCartNode, userErrors: [], warnings: [] },
    });
    mockRequest.mockResolvedValueOnce({
      cartDeliveryAddressesAdd: { cart: twoOptionsCartNode, userErrors: [], warnings: [] },
    });
    await updateCheckoutContact(VALID_INPUT);
    const [, vars] = mockRequest.mock.calls[0];
    expect(vars).toEqual({
      cartId: CART_ID,
      buyerIdentity: { email: 'jane@example.com', phone: '+1 555 123 4567', countryCode: 'US' },
    });
  });

  it('passes a single selected delivery address (selected: true) with no price', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: { cart: noDeliveryFieldCartNode, userErrors: [], warnings: [] },
    });
    mockRequest.mockResolvedValueOnce({
      cartDeliveryAddressesAdd: { cart: twoOptionsCartNode, userErrors: [], warnings: [] },
    });
    await updateCheckoutContact(VALID_INPUT);
    const [, vars] = mockRequest.mock.calls[1] as [
      string,
      { cartId: string; addresses: { address: { deliveryAddress: Record<string, unknown> }; selected: boolean }[] },
    ];
    expect(vars.cartId).toBe(CART_ID);
    expect(vars.addresses).toHaveLength(1);
    expect(vars.addresses[0].selected).toBe(true);
    const da = vars.addresses[0].address.deliveryAddress;
    expect(da.firstName).toBe('Jane');
    expect(da.address1).toBe('123 Main St');
    expect(da.city).toBe('Springfield');
    expect(da.countryCode).toBe('US');
    expect(da.zip).toBe('62704');
    expect(da).not.toHaveProperty('provinceCode');
    expect(da).not.toHaveProperty('price');
    expect(da).not.toHaveProperty('amount');
  });

  it('throws a NON-LEAKING error on buyer-identity userErrors (no GraphQL detail)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: {
        cart: null,
        userErrors: [{ field: ['buyerIdentity', 'email'], message: 'Email gid://shopify/x is invalid' }],
        warnings: [],
      },
    });
    let caught: unknown;
    try {
      await updateCheckoutContact(VALID_INPUT);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).not.toContain('gid://shopify');
    expect(msg).not.toContain('Email');
    expect(msg).not.toContain('buyerIdentity');
    // Must NOT have proceeded to the delivery-address call.
    const calledQueries = mockRequest.mock.calls.map((c) => c[0]);
    expect(calledQueries).not.toContain(CART_DELIVERY_ADDRESSES_ADD_MUTATION);
  });

  it('throws on cartDeliveryAddressesAdd userErrors', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: { cart: noDeliveryFieldCartNode, userErrors: [], warnings: [] },
    });
    mockRequest.mockResolvedValueOnce({
      cartDeliveryAddressesAdd: {
        cart: null,
        userErrors: [{ field: ['addresses', '0'], message: 'country code XX not supported' }],
        warnings: [],
      },
    });
    await expect(updateCheckoutContact(VALID_INPUT)).rejects.toThrow();
  });

  it('logs warnings but does NOT throw (warnings are non-fatal)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: {
        cart: noDeliveryFieldCartNode,
        userErrors: [],
        warnings: [{ code: 'ADDRESS_VALIDATION', message: 'address could not be validated' }],
      },
    });
    mockRequest.mockResolvedValueOnce({
      cartDeliveryAddressesAdd: { cart: twoOptionsCartNode, userErrors: [], warnings: [] },
    });
    const out = await updateCheckoutContact(VALID_INPUT);
    expect(out).toEqual(mapCheckoutDetails(twoOptionsCartNode)); // succeeded despite warnings
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('clears the cookie and returns null when the cart expired mid-flow (buyer identity cart:null)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    // userErrors empty but cart null → expired.
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: { cart: null, userErrors: [], warnings: [] },
    });
    const out = await updateCheckoutContact(VALID_INPUT);
    expect(out).toBeNull();
    expect(mockClearCartId.mock.calls).toHaveLength(1);
  });

  it('rejects an invalid payload (re-validates server-side, never trusts the client)', async () => {
    // Bad email + missing required fields — zod fails server-side.
    await expect(updateCheckoutContact({ ...VALID_INPUT, email: 'not-an-email', firstName: '' })).rejects.toThrow();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('rejects an unknown country code (zod guard)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    await expect(updateCheckoutContact({ ...VALID_INPUT, country: 'ZZ' })).rejects.toThrow();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// selectDeliveryOption
// ---------------------------------------------------------------------------

const GROUP_ID = 'gid://shopify/CartDeliveryGroup/dg-1';
const OPTION_HANDLE = 'shopify-Express-1';

describe('selectDeliveryOption', () => {
  it('returns null without calling Shopify when there is no cart cookie', async () => {
    const out = await selectDeliveryOption({ deliveryGroupId: GROUP_ID, deliveryOptionHandle: OPTION_HANDLE });
    expect(out).toBeNull();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('calls cartSelectedDeliveryOptionsUpdate and returns the mapped details', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    // selectedOptionCartNode has the selected option + totalAmount 35.
    const { selectedOptionCartNode } = await import('./fixtures/checkout-cart-node');
    mockRequest.mockResolvedValueOnce({
      cartSelectedDeliveryOptionsUpdate: { cart: selectedOptionCartNode, userErrors: [], warnings: [] },
    });
    const out = await selectDeliveryOption({ deliveryGroupId: GROUP_ID, deliveryOptionHandle: OPTION_HANDLE });
    expect(shopifyRequest).toHaveBeenCalledWith(CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION, {
      cartId: CART_ID,
      selectedDeliveryOptions: [{ deliveryGroupId: GROUP_ID, deliveryOptionHandle: OPTION_HANDLE }],
    });
    expect(out?.cart.totalAmount).toBe(35);
    expect(out?.deliveryGroups[0].selectedHandle).toBe(OPTION_HANDLE);
  });

  it('throws a non-leaking error on userErrors', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartSelectedDeliveryOptionsUpdate: {
        cart: null,
        userErrors: [{ field: ['selectedDeliveryOptions', '0'], message: 'delivery option gid://shopify/y not found' }],
        warnings: [],
      },
    });
    let caught: unknown;
    try {
      await selectDeliveryOption({ deliveryGroupId: GROUP_ID, deliveryOptionHandle: OPTION_HANDLE });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).not.toContain('gid://shopify');
    expect(msg).not.toContain('delivery option');
    expect(msg).not.toContain('selectedDeliveryOptions');
  });

  it('clears the cookie and returns null when the cart expired', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartSelectedDeliveryOptionsUpdate: { cart: null, userErrors: [], warnings: [] },
    });
    const out = await selectDeliveryOption({ deliveryGroupId: GROUP_ID, deliveryOptionHandle: OPTION_HANDLE });
    expect(out).toBeNull();
    expect(mockClearCartId.mock.calls).toHaveLength(1);
  });

  it('rejects an empty deliveryGroupId or handle', async () => {
    await expect(selectDeliveryOption({ deliveryGroupId: '', deliveryOptionHandle: OPTION_HANDLE })).rejects.toThrow();
    await expect(selectDeliveryOption({ deliveryGroupId: GROUP_ID, deliveryOptionHandle: '' })).rejects.toThrow();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCheckoutDetails
// ---------------------------------------------------------------------------

describe('getCheckoutDetails', () => {
  it('returns null without calling Shopify when there is no cart cookie', async () => {
    const out = await getCheckoutDetails();
    expect(out).toBeNull();
    expect(shopifyRequest).not.toHaveBeenCalled();
  });

  it('reads with CART_WITH_DELIVERY_QUERY and returns the mapped details', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({ cart: twoOptionsCartNode });
    const out = await getCheckoutDetails();
    expect(shopifyRequest).toHaveBeenCalledWith(CART_WITH_DELIVERY_QUERY, { id: CART_ID });
    expect(out).toEqual(mapCheckoutDetails(twoOptionsCartNode));
  });

  it('clears the cookie and returns null when the cart expired', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({ cart: null });
    const out = await getCheckoutDetails();
    expect(out).toBeNull();
    expect(mockClearCartId.mock.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Price invariant — no checkout mutation payload ever contains a price.
// ---------------------------------------------------------------------------

describe('price invariant — no checkout payload contains a price', () => {
  it('updateCheckoutContact sends no price/amount in any variables object', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: { cart: noDeliveryFieldCartNode, userErrors: [], warnings: [] },
    });
    mockRequest.mockResolvedValueOnce({
      cartDeliveryAddressesAdd: { cart: twoOptionsCartNode, userErrors: [], warnings: [] },
    });
    await updateCheckoutContact(VALID_INPUT);

    for (const [, vars] of mockRequest.mock.calls) {
      const json = JSON.stringify(vars);
      expect(json).not.toContain('"price"');
      expect(json).not.toContain('"amount"');
    }
  });

  it('selectDeliveryOption sends only the two opaque handles (no price)', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    const { selectedOptionCartNode } = await import('./fixtures/checkout-cart-node');
    mockRequest.mockResolvedValueOnce({
      cartSelectedDeliveryOptionsUpdate: { cart: selectedOptionCartNode, userErrors: [], warnings: [] },
    });
    await selectDeliveryOption({ deliveryGroupId: GROUP_ID, deliveryOptionHandle: OPTION_HANDLE });
    const [, vars] = mockRequest.mock.calls[0];
    const json = JSON.stringify(vars);
    expect(json).not.toContain('"price"');
    expect(json).not.toContain('"amount"');
    // Only cartId + the two handles.
    expect(Object.keys(vars as Record<string, unknown>).sort()).toEqual(['cartId', 'selectedDeliveryOptions']);
  });
});

// ---------------------------------------------------------------------------
// Opaque cart id invariant — never parsed/logged/returned.
// ---------------------------------------------------------------------------

describe('opaque cart id invariant', () => {
  it('passes the cart id VERBATIM (incl. the ?key= secret) to every Shopify call', async () => {
    mockGetCartId.mockResolvedValue(CART_ID);
    mockRequest.mockResolvedValueOnce({
      cartBuyerIdentityUpdate: { cart: noDeliveryFieldCartNode, userErrors: [], warnings: [] },
    });
    mockRequest.mockResolvedValueOnce({
      cartDeliveryAddressesAdd: { cart: twoOptionsCartNode, userErrors: [], warnings: [] },
    });
    await updateCheckoutContact(VALID_INPUT);
    for (const [, vars] of mockRequest.mock.calls) {
      expect((vars as { cartId?: string }).cartId).toBe(CART_ID);
    }
  });
});