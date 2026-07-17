import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Cart store tests (optimistic cache over the Shopify cart).
//
// The store is an OPTIMISTIC CACHE: it updates the UI instantly, calls the
// server action, then reconciles with the authoritative `Cart` the action
// returns. On error it rolls back (add) or re-hydrates from the server
// (update/remove). These tests mock the cart server actions so no Shopify /
// cookie / next machinery loads, and drive every store method through its
// optimistic + reconcile + rollback paths.
//
// Key invariants under test:
//   - addItem with NO merchandiseId → graceful error, no Shopify call.
//   - addItem appends a provisional line (lineId starts with 'tmp-') instantly,
//     opens the drawer, sets status 'pending'; on resolve → server cart wins.
//   - On add error the provisional line is rolled back; totalQuantity is
//     recomputed from the remaining cached lines (never goes negative).
//   - setQuantity ≤ 0 removes the line optimistically; on resolve server wins.
//   - After any successful action, totalQuantity comes from the SERVER cart
//     (cart.totalQuantity), NOT items.length.
//   - hydrateFromServer(null) empties the cache.
// ---------------------------------------------------------------------------

vi.mock('@/app/cart/actions', () => ({
  addToCart: vi.fn(),
  updateCartLine: vi.fn(),
  removeCartLine: vi.fn(),
  clearCart: vi.fn(),
  getCart: vi.fn(),
}));

// The test imports mapCart from lib/shopify/adapter (to build Cart fixtures),
// and adapter.ts imports 'server-only' (build-time guard against client
// imports). Under Vitest its default export throws, so mock it to an empty
// module.
vi.mock('server-only', () => ({}));

const { useCart, MAX_QTY_PER_LINE } = await import('@/store/use-cart');
const {
  addToCart,
  updateCartLine,
  removeCartLine,
  clearCart: clearCartAction,
  getCart,
} = await import('@/app/cart/actions');
const { mapCart } = await import('@/lib/shopify/adapter');
const { singleLineCartNode, multiLineCartNode, emptyCartNode } = await import('./fixtures/cart-node');

const mAddToCart = vi.mocked(addToCart);
const mUpdateCartLine = vi.mocked(updateCartLine);
const mRemoveCartLine = vi.mocked(removeCartLine);
const mClearCart = vi.mocked(clearCartAction);
const mGetCart = vi.mocked(getCart);

const singleCart = mapCart(singleLineCartNode); // 1 line, qty 2, totalQuantity 2
const multiCart = mapCart(multiLineCartNode); // 2 lines, totalQuantity 5
const emptyCart = mapCart(emptyCartNode); // 0 lines, totalQuantity 0

const INPUT = {
  merchandiseId: 'gid://shopify/ProductVariant/46514157256901',
  name: 'Shirts',
  price: 10,
  variantLabel: 'Small',
  image: 'https://cdn.shopify.com/x.jpg',
  currencyCode: 'USD',
};

beforeEach(() => {
  vi.clearAllMocks();
  mAddToCart.mockReset();
  mUpdateCartLine.mockReset();
  mRemoveCartLine.mockReset();
  mClearCart.mockReset();
  mGetCart.mockReset();
  // Reset the singleton store to its initial empty state.
  useCart.setState({
    isOpen: false,
    items: [],
    totalQuantity: 0,
    subtotalAmount: 0,
    totalAmount: 0,
    totalAmountEstimated: true,
    currencyCode: 'USD',
    checkoutUrl: '',
    status: 'idle',
    error: null,
  });
});

describe('MAX_QTY_PER_LINE', () => {
  it('is 10 (client-side UX clamp only)', () => {
    expect(MAX_QTY_PER_LINE).toBe(10);
  });
});

describe('openCart / closeCart / toggleCart', () => {
  it('opens, closes, and toggles the drawer', () => {
    useCart.getState().openCart();
    expect(useCart.getState().isOpen).toBe(true);
    useCart.getState().closeCart();
    expect(useCart.getState().isOpen).toBe(false);
    useCart.getState().toggleCart();
    expect(useCart.getState().isOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addItem
// ---------------------------------------------------------------------------

describe('addItem', () => {
  it('rejects gracefully when the item has no merchandiseId (no Shopify call)', async () => {
    await useCart.getState().addItem({ name: 'Mock Tee', price: 30, variantLabel: 'M', image: 'x' });
    const s = useCart.getState();
    expect(s.status).toBe('error');
    expect(s.error).toBeTruthy();
    expect(s.items).toHaveLength(0);
    expect(mAddToCart).not.toHaveBeenCalled();
  });

  it('optimistically appends a provisional line and opens the drawer (before the server responds)', async () => {
    // Keep the action pending so the optimistic state is observable.
    mAddToCart.mockReturnValue(new Promise(() => {}));
    void useCart.getState().addItem(INPUT, 2);
    const s = useCart.getState();
    expect(s.isOpen).toBe(true);
    expect(s.status).toBe('pending');
    expect(s.items).toHaveLength(1);
    const line = s.items[0];
    expect(line.lineId.startsWith('tmp-')).toBe(true);
    expect(line.merchandiseId).toBe(INPUT.merchandiseId);
    expect(line.name).toBe('Shirts');
    expect(line.quantity).toBe(2);
    // totalQuantity reflects the provisional line immediately (2, NOT items.length 1).
    expect(s.totalQuantity).toBe(2);
  });

  it('reconciles with the server cart on success (server totalQuantity wins)', async () => {
    mAddToCart.mockResolvedValue(singleCart);
    await useCart.getState().addItem(INPUT, 2);
    const s = useCart.getState();
    expect(s.status).toBe('idle');
    expect(s.error).toBeNull();
    expect(s.items).toEqual(singleCart.lines);
    expect(s.totalQuantity).toBe(singleCart.totalQuantity); // 2 from server
    expect(s.subtotalAmount).toBe(singleCart.subtotalAmount);
    expect(s.checkoutUrl).toBe(singleCart.checkoutUrl);
  });

  it('rolls back the provisional line on error and recomputes totalQuantity from remaining lines', async () => {
    // Pre-seed one real line, then attempt an add that fails.
    useCart.setState({ items: [{ ...singleCart.lines[0], quantity: 1 }], totalQuantity: 1 });
    mAddToCart.mockRejectedValue(new Error('We could not update your bag. Please try again.'));
    await useCart.getState().addItem(INPUT, 3);
    const s = useCart.getState();
    expect(s.status).toBe('error');
    expect(s.error).toContain('could not update');
    // Provisional line gone; only the pre-seeded line remains.
    expect(s.items).toHaveLength(1);
    expect(s.items.every((i) => !i.lineId.startsWith('tmp-'))).toBe(true);
    // totalQuantity recomputed from the remaining cached line (1), not negative.
    expect(s.totalQuantity).toBe(1);
  });

  it('clamps the incoming quantity to MAX_QTY_PER_LINE', async () => {
    mAddToCart.mockReturnValue(new Promise(() => {}));
    void useCart.getState().addItem(INPUT, 99);
    expect(useCart.getState().items[0].quantity).toBe(MAX_QTY_PER_LINE);
  });
});

// ---------------------------------------------------------------------------
// setQuantity
// ---------------------------------------------------------------------------

describe('setQuantity', () => {
  it('optimistically updates the line quantity and reconciles with the server', async () => {
    useCart.setState({ items: singleCart.lines.slice(), totalQuantity: 2 });
    mUpdateCartLine.mockResolvedValue({ ...singleCart, lines: [{ ...singleCart.lines[0], quantity: 5 }], totalQuantity: 5 });
    await useCart.getState().setQuantity(singleCart.lines[0].lineId, 5);
    const s = useCart.getState();
    expect(s.status).toBe('idle');
    expect(s.items[0].quantity).toBe(5);
    expect(s.totalQuantity).toBe(5);
    expect(mUpdateCartLine).toHaveBeenCalledWith({ lineId: singleCart.lines[0].lineId, quantity: 5 });
  });

  it('routes quantity ≤ 0 to removal (optimistically drops the line)', async () => {
    useCart.setState({ items: singleCart.lines.slice(), totalQuantity: 2 });
    // updateCartLine(qty 0) calls removeCartLine under the hood on the server.
    mUpdateCartLine.mockResolvedValue(emptyCart);
    await useCart.getState().setQuantity(singleCart.lines[0].lineId, 0);
    const s = useCart.getState();
    expect(s.items).toHaveLength(0);
    expect(s.totalQuantity).toBe(0);
    expect(mUpdateCartLine).toHaveBeenCalledWith({ lineId: singleCart.lines[0].lineId, quantity: 0 });
  });

  it('re-hydrates from the server on error (restores authoritative state)', async () => {
    useCart.setState({ items: singleCart.lines.slice(), totalQuantity: 2 });
    mUpdateCartLine.mockRejectedValue(new Error('boom'));
    mGetCart.mockResolvedValue(singleCart); // server still has the original cart
    await useCart.getState().setQuantity(singleCart.lines[0].lineId, 9);
    const s = useCart.getState();
    // Re-hydrated from getCart → back to the server's qty 2.
    expect(s.items[0].quantity).toBe(2);
    expect(s.totalQuantity).toBe(2);
    expect(mGetCart).toHaveBeenCalled();
  });

  it('ignores a non-finite quantity', async () => {
    useCart.setState({ items: singleCart.lines.slice(), totalQuantity: 2 });
    await useCart.getState().setQuantity(singleCart.lines[0].lineId, Number.NaN);
    expect(mUpdateCartLine).not.toHaveBeenCalled();
    // State unchanged.
    expect(useCart.getState().totalQuantity).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// removeItem
// ---------------------------------------------------------------------------

describe('removeItem', () => {
  it('optimistically removes the line and reconciles with the server', async () => {
    useCart.setState({ items: multiCart.lines.slice(), totalQuantity: 5 });
    mRemoveCartLine.mockResolvedValue({ ...multiCart, lines: [multiCart.lines[1]], totalQuantity: 3 });
    await useCart.getState().removeItem(multiCart.lines[0].lineId);
    const s = useCart.getState();
    expect(s.items).toHaveLength(1);
    expect(s.totalQuantity).toBe(3);
    expect(mRemoveCartLine).toHaveBeenCalledWith({ lineId: multiCart.lines[0].lineId });
  });

  it('re-hydrates on error', async () => {
    useCart.setState({ items: multiCart.lines.slice(), totalQuantity: 5 });
    mRemoveCartLine.mockRejectedValue(new Error('boom'));
    mGetCart.mockResolvedValue(multiCart);
    await useCart.getState().removeItem(multiCart.lines[0].lineId);
    // Server still has both lines → restored.
    expect(useCart.getState().items).toHaveLength(2);
    expect(useCart.getState().totalQuantity).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// clearCart
// ---------------------------------------------------------------------------

describe('clearCart', () => {
  it('empties the cache and calls the clearCart server action', async () => {
    useCart.setState({ items: singleCart.lines.slice(), totalQuantity: 2 });
    mClearCart.mockResolvedValue(undefined);
    await useCart.getState().clearCart();
    const s = useCart.getState();
    expect(s.items).toHaveLength(0);
    expect(s.totalQuantity).toBe(0);
    expect(s.subtotalAmount).toBe(0);
    expect(mClearCart).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hydrateFromServer
// ---------------------------------------------------------------------------

describe('hydrateFromServer', () => {
  it('populates the cache from a server cart', () => {
    useCart.getState().hydrateFromServer(multiCart);
    const s = useCart.getState();
    expect(s.items).toEqual(multiCart.lines);
    expect(s.totalQuantity).toBe(5);
    expect(s.subtotalAmount).toBe(multiCart.subtotalAmount);
    expect(s.checkoutUrl).toBe(multiCart.checkoutUrl);
    expect(s.status).toBe('idle');
  });

  it('empties the cache when the cart is null (no / expired cart)', () => {
    useCart.setState({ items: singleCart.lines.slice(), totalQuantity: 2 });
    useCart.getState().hydrateFromServer(null);
    const s = useCart.getState();
    expect(s.items).toHaveLength(0);
    expect(s.totalQuantity).toBe(0);
  });
});
