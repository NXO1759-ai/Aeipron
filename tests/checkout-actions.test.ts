import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Checkout server-action tests (Phase 4b — custom checkout).
//
// The three checkout actions (updateCheckoutContact, selectDeliveryOption,
// getCheckoutDetails) orchestrate the cookie (mocked), the Shopify Cart API
// (mocked), and domain helpers. These tests verify the decision logic —
// buyerIdentity split, add-vs-update address branching, delivery-option
// selection, and non-leaking error mapping — NOT the network.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

const mockGetCartId = vi.fn<() => Promise<string | null>>();
vi.mock('@/lib/cart-cookie', () => ({
  getCartId: () => mockGetCartId(),
  setCartId: vi.fn(),
  clearCartId: vi.fn(),
  CART_COOKIE: 'apeiron-cart-id',
}));

const mockShopifyRequest = vi.fn();
vi.mock('@/lib/shopify/client', () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
  ShopifyClientError: class ShopifyClientError extends Error {},
}));

const {
  updateCheckoutContact,
  selectDeliveryOption,
  getCheckoutDetails,
} = await import('@/app/checkout/actions');
const {
  CART_BUYER_IDENTITY_UPDATE_MUTATION,
  CART_DELIVERY_ADDRESSES_ADD_MUTATION,
  CART_DELIVERY_ADDRESSES_UPDATE_MUTATION,
  CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION,
  CART_WITH_DELIVERY_QUERY,
} = await import('@/lib/shopify/queries');

const CART_ID = 'gid://shopify/Cart/abc?key=secret';
const GROUP_GID = 'gid://shopify/CartDeliveryGroup/1';
const ADDRESS_GID = 'gid://shopify/CartSelectableAddress/9';

const VALID_CONTACT = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+1 555 123 4567',
  address1: '123 Main St',
  address2: '',
  city: 'Brooklyn',
  zip: '11201',
  country: 'US',
};

function deliveryGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: GROUP_GID,
    selectedDeliveryOption: null,
    deliveryOptions: [
      {
        handle: 'h-std',
        code: 'STD',
        title: 'Standard',
        description: null,
        estimatedCost: { amount: '5.0', currencyCode: 'USD' },
        deliveryMethodType: 'SHIPPING',
      },
      {
        handle: 'h-exp',
        code: 'EXP',
        title: 'Express',
        description: null,
        estimatedCost: { amount: '15.0', currencyCode: 'USD' },
        deliveryMethodType: 'SHIPPING',
      },
    ],
    ...overrides,
  };
}

function cartWithDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: CART_ID,
    totalQuantity: 1,
    checkoutUrl: 'https://aeipron.myshopify.com/cart/c/abc?key=secret',
    cost: {
      subtotalAmount: { amount: '120.0', currencyCode: 'USD' },
      totalAmount: { amount: '125.0', currencyCode: 'USD' },
      totalAmountEstimated: true,
    },
    lines: { edges: [] },
    deliveryGroups: { nodes: [deliveryGroup()] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCartId.mockResolvedValue(CART_ID);
});

describe('updateCheckoutContact', () => {
  it('returns null (no Shopify call) when there is no cart cookie', async () => {
    mockGetCartId.mockResolvedValue(null);
    await expect(updateCheckoutContact(VALID_CONTACT)).resolves.toBeNull();
    expect(mockShopifyRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid input with a zod validation error before any Shopify call', async () => {
    const result = await updateCheckoutContact({ ...VALID_CONTACT, email: 'bad' });
    expect(result).toBeNull();
    expect(mockShopifyRequest).not.toHaveBeenCalled();
  });

  it('splits buyerIdentity (email/phone/countryCode) from the delivery address', async () => {
    // Sequence: withDelivery (no existing address) → buyerIdentity → addressesAdd → withDelivery.
    mockShopifyRequest
      .mockResolvedValueOnce({ cart: cartWithDelivery() }) // probe: no selected address
      .mockResolvedValueOnce({ cartBuyerIdentityUpdate: { cart: cartWithDelivery(), userErrors: [], warnings: [] } })
      .mockResolvedValueOnce({ cartDeliveryAddressesAdd: { cart: cartWithDelivery(), userErrors: [], warnings: [] } })
      .mockResolvedValueOnce({ cart: cartWithDelivery() }); // final read

    const result = await updateCheckoutContact(VALID_CONTACT);

    expect(result).not.toBeNull();
    // 1) buyerIdentity carries ONLY contact + countryCode (never the address).
    expect(mockShopifyRequest).toHaveBeenNthCalledWith(2, CART_BUYER_IDENTITY_UPDATE_MUTATION, {
      cartId: CART_ID,
      buyerIdentity: { email: 'jane@example.com', phone: '+1 555 123 4567', countryCode: 'US' },
    });
    // 2) the address goes through cartDeliveryAddressesAdd with selected: true.
    const addCall = mockShopifyRequest.mock.calls[2];
    expect(addCall[0]).toBe(CART_DELIVERY_ADDRESSES_ADD_MUTATION);
    expect(addCall[1].cartId).toBe(CART_ID);
    expect(addCall[1].addresses).toHaveLength(1);
    expect(addCall[1].addresses[0].selected).toBe(true);
    expect(addCall[1].addresses[0].address.deliveryAddress).toMatchObject({
      address1: '123 Main St',
      city: 'Brooklyn',
      countryCode: 'US',
      zip: '11201',
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('uses cartDeliveryAddressesUpdate (idempotent) when an address already exists', async () => {
    const existing = cartWithDelivery();
    (existing.deliveryGroups.nodes[0] as Record<string, unknown>).deliveryAddress = {
      id: ADDRESS_GID,
      address1: '1 Old St',
    };
    mockShopifyRequest
      .mockResolvedValueOnce({ cart: existing }) // probe finds existing address id
      .mockResolvedValueOnce({ cartBuyerIdentityUpdate: { cart: existing, userErrors: [], warnings: [] } })
      .mockResolvedValueOnce({ cartDeliveryAddressesUpdate: { cart: existing, userErrors: [], warnings: [] } })
      .mockResolvedValueOnce({ cart: existing });

    await updateCheckoutContact(VALID_CONTACT);

    const updateCall = mockShopifyRequest.mock.calls[2];
    expect(updateCall[0]).toBe(CART_DELIVERY_ADDRESSES_UPDATE_MUTATION);
    expect(updateCall[1].addresses[0].id).toBe(ADDRESS_GID);
    // Never ADD when an address id exists (no duplicate accumulation).
    expect(
      mockShopifyRequest.mock.calls.some((c) => c[0] === CART_DELIVERY_ADDRESSES_ADD_MUTATION),
    ).toBe(false);
  });

  it('returns null with a generic log when Shopify userErrors occur', async () => {
    mockShopifyRequest
      .mockResolvedValueOnce({ cart: cartWithDelivery() })
      .mockResolvedValueOnce({
        cartBuyerIdentityUpdate: {
          cart: null,
          userErrors: [{ field: ['buyerIdentity', 'email'], message: 'Email is invalid' }],
          warnings: [],
        },
      });

    await expect(updateCheckoutContact(VALID_CONTACT)).resolves.toBeNull();
  });
});

describe('selectDeliveryOption', () => {
  it('persists the two opaque handles via cartSelectedDeliveryOptionsUpdate', async () => {
    const selected = cartWithDelivery();
    (selected.deliveryGroups.nodes[0] as Record<string, unknown>).selectedDeliveryOption =
      deliveryGroup().deliveryOptions[0];
    mockShopifyRequest.mockResolvedValue({
      cartSelectedDeliveryOptionsUpdate: { cart: selected, userErrors: [], warnings: [] },
    });

    const result = await selectDeliveryOption({
      deliveryGroupId: GROUP_GID,
      deliveryOptionHandle: 'h-std',
    });

    expect(result).not.toBeNull();
    expect(mockShopifyRequest).toHaveBeenCalledWith(
      CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION,
      { cartId: CART_ID, selectedDeliveryOptions: [{ deliveryGroupId: GROUP_GID, deliveryOptionHandle: 'h-std' }] },
    );
  });

  it('returns null when there is no cart cookie', async () => {
    mockGetCartId.mockResolvedValue(null);
    await expect(
      selectDeliveryOption({ deliveryGroupId: GROUP_GID, deliveryOptionHandle: 'h-std' }),
    ).resolves.toBeNull();
    expect(mockShopifyRequest).not.toHaveBeenCalled();
  });
});

describe('getCheckoutDetails', () => {
  it('returns null when there is no cart cookie', async () => {
    mockGetCartId.mockResolvedValue(null);
    await expect(getCheckoutDetails()).resolves.toBeNull();
    expect(mockShopifyRequest).not.toHaveBeenCalled();
  });

  it('reads the cart with delivery groups and maps options + selected handle', async () => {
    mockShopifyRequest.mockResolvedValue({ cart: cartWithDelivery() });

    const details = await getCheckoutDetails();

    expect(mockShopifyRequest).toHaveBeenCalledWith(CART_WITH_DELIVERY_QUERY, { id: CART_ID });
    expect(details?.deliveryGroups).toHaveLength(1);
    expect(details?.deliveryGroups[0].deliveryOptions.map((o) => o.title)).toEqual(['Standard', 'Express']);
    expect(details?.deliveryGroups[0].selectedHandle).toBeNull();
  });

  it('returns null (and clears nothing) when the Shopify call throws', async () => {
    mockShopifyRequest.mockRejectedValue(new Error('network down'));
    await expect(getCheckoutDetails()).resolves.toBeNull();
  });
});
