import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Cart, CartLine } from '@/lib/types';

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
  swapShippingProtection: vi.fn(),
}));

// The test imports mapCart from lib/shopify/adapter (to build Cart fixtures),
// and adapter.ts imports 'server-only' (build-time guard against client
// imports). Under Vitest its default export throws, so mock it to an empty
// module.
vi.mock('server-only', () => ({}));

const { useCart, MAX_QTY_PER_LINE, selectHasShippingProtection, selectMerchandiseCount, __resetCartMutationQueueForTests } = await import('@/store/use-cart');
const {
  addToCart,
  updateCartLine,
  removeCartLine,
  clearCart: clearCartAction,
  getCart,
  swapShippingProtection,
} = await import('@/app/cart/actions');
const { mapCart } = await import('@/lib/shopify/adapter');
const { singleLineCartNode, multiLineCartNode, emptyCartNode } = await import('./fixtures/cart-node');

const mAddToCart = vi.mocked(addToCart);
const mUpdateCartLine = vi.mocked(updateCartLine);
const mRemoveCartLine = vi.mocked(removeCartLine);
const mClearCart = vi.mocked(clearCartAction);
const mGetCart = vi.mocked(getCart);
const mSwap = vi.mocked(swapShippingProtection);

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

// A minimal 2-tier protection grid + rate for store tests. Tier $1.00 covers a
// ~$50 subtotal (50 × 0.02 = 1.00); tier $2.01 covers a ~$100 subtotal
// (100 × 0.02 = 2.00 → nearest is 2.01). Used to exercise toggle + tier-cross.
const PROTECTION_VARIANTS = [
  { id: 'gid://shopify/ProductVariant/10000000000001', title: '1.00', price: 1.0 },
  { id: 'gid://shopify/ProductVariant/10000000000002', title: '2.01', price: 2.01 },
];
const PROTECTION_RATE = 0.02;
const PROTECTION_LINE_ID = 'gid://shopify/CartLine/prot-real';
const protectionLine = (price: number, merchandiseId: string): CartLine => ({
  lineId: PROTECTION_LINE_ID,
  merchandiseId,
  name: 'Shipping Protection',
  price,
  variantLabel: '',
  image: '',
  currencyCode: 'USD',
  quantity: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  mAddToCart.mockReset();
  mUpdateCartLine.mockReset();
  mRemoveCartLine.mockReset();
  mClearCart.mockReset();
  mGetCart.mockReset();
  mSwap.mockReset();
  // Reset the module-level serial mutation queue so a prior test's
  // fire-and-forget mutation can't leave it chained to an unsettled task (which
  // would hang every later test's mutation). Production code never does this.
  __resetCartMutationQueueForTests();
  // Reset the singleton store to its initial empty state (incl. no protection
  // config — each protection test sets its own via setProtectionConfig).
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
    protectionVariants: [],
    protectionRate: 0,
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

  it('drops the protection line too when removing the last merchandise line (cart shows empty)', async () => {
    // The user's Phase 4 requirement: when the last real product is removed
    // with shipping protection enabled, protection is also removed so the cart
    // shows the empty message (no orphan protection line keeping it non-empty).
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merchLine = { ...singleCart.lines[0], price: 50, quantity: 1 };
    useCart.setState({ items: [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)], totalQuantity: 2 });
    // First removeCartLine drops the merchandise → server cart still has the
    // orphan protection line; the second removeCartLine drops it → empty cart.
    mRemoveCartLine.mockResolvedValueOnce({ ...singleCart, lines: [protectionLine(1.0, PROTECTION_VARIANTS[0].id)], totalQuantity: 1, subtotalAmount: 1 });
    mRemoveCartLine.mockResolvedValueOnce({ ...emptyCart, lines: [], totalQuantity: 0, subtotalAmount: 0 });
    await useCart.getState().removeItem(merchLine.lineId);
    expect(mRemoveCartLine).toHaveBeenCalledTimes(2);
    expect(mRemoveCartLine).toHaveBeenNthCalledWith(1, { lineId: merchLine.lineId });
    expect(mRemoveCartLine).toHaveBeenNthCalledWith(2, { lineId: PROTECTION_LINE_ID });
    const s = useCart.getState();
    expect(s.items).toHaveLength(0); // truly empty — the empty message shows
    expect(s.totalQuantity).toBe(0);
    expect(s.status).toBe('idle');
  });

  it('does NOT drop protection when removing a non-last merchandise line', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const a = { ...multiCart.lines[0], price: 50, quantity: 2 };
    const b = { ...multiCart.lines[1], price: 30, quantity: 1 };
    useCart.setState({ items: [a, b, protectionLine(1.0, PROTECTION_VARIANTS[0].id)], totalQuantity: 4 });
    mRemoveCartLine.mockResolvedValue({ ...multiCart, lines: [b, protectionLine(1.0, PROTECTION_VARIANTS[0].id)], totalQuantity: 2 });
    await useCart.getState().removeItem(a.lineId);
    expect(mRemoveCartLine).toHaveBeenCalledTimes(1); // no second removeCartLine
    expect(useCart.getState().items).toHaveLength(2); // remaining merch + protection kept
  });
});

// ---------------------------------------------------------------------------
// auto-disable protection on last-product removal (Phase 4)
//
// setQuantity(qty ≤ 0) and removeItem both optimistically drop the protection
// line when they remove the last merchandise line. autoDisableProtectionIfEmpty
// is the safety net for edges the optimistic path can't catch (an orphan
// protection line persisted from a prior session, surfaced when the config
// loads on mount).
// ---------------------------------------------------------------------------

describe('setQuantity (auto-disable protection on last product)', () => {
  it('drops the protection line too when qty→0 on the last merchandise line', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merchLine = { ...singleCart.lines[0], price: 50, quantity: 1 };
    useCart.setState({ items: [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)], totalQuantity: 2 });
    // updateCartLine(qty 0) → server cart still has the orphan protection line;
    // the follow-up removeCartLine drops it → empty cart.
    mUpdateCartLine.mockResolvedValueOnce({ ...singleCart, lines: [protectionLine(1.0, PROTECTION_VARIANTS[0].id)], totalQuantity: 1, subtotalAmount: 1 });
    mRemoveCartLine.mockResolvedValueOnce({ ...emptyCart, lines: [], totalQuantity: 0, subtotalAmount: 0 });
    await useCart.getState().setQuantity(merchLine.lineId, 0);
    expect(mUpdateCartLine).toHaveBeenCalledWith({ lineId: merchLine.lineId, quantity: 0 });
    expect(mRemoveCartLine).toHaveBeenCalledWith({ lineId: PROTECTION_LINE_ID });
    const s = useCart.getState();
    expect(s.items).toHaveLength(0);
    expect(s.totalQuantity).toBe(0);
    expect(s.status).toBe('idle');
  });
});

describe('autoDisableProtectionIfEmpty', () => {
  it('turns protection off when only an orphan protection line remains (merchandise = 0)', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: [protectionLine(1.0, PROTECTION_VARIANTS[0].id)], totalQuantity: 1, status: 'idle' });
    mRemoveCartLine.mockResolvedValue({ ...emptyCart, lines: [], totalQuantity: 0, subtotalAmount: 0 });
    await useCart.getState().autoDisableProtectionIfEmpty();
    expect(mRemoveCartLine).toHaveBeenCalledWith({ lineId: PROTECTION_LINE_ID });
    const s = useCart.getState();
    expect(s.items).toHaveLength(0); // protection removed → cart shows empty
    expect(s.status).toBe('idle');
  });

  it('is a no-op when merchandise is still present (protection stays on)', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merchLine = { ...singleCart.lines[0], price: 50, quantity: 1 };
    useCart.setState({ items: [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)], status: 'idle' });
    await useCart.getState().autoDisableProtectionIfEmpty();
    expect(mRemoveCartLine).not.toHaveBeenCalled();
    expect(useCart.getState().items).toHaveLength(2);
  });

  it('is a no-op when protection is already off (no protection line)', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: [singleCart.lines[0]], status: 'idle' });
    await useCart.getState().autoDisableProtectionIfEmpty();
    expect(mRemoveCartLine).not.toHaveBeenCalled();
  });

  it('is a no-op when no protection config is loaded (product not visible)', async () => {
    // protectionVariants is [] (the beforeEach reset) — no config → no action,
    // even if a protection-like line happened to be cached.
    useCart.setState({ items: [protectionLine(1.0, PROTECTION_VARIANTS[0].id)], status: 'idle' });
    await useCart.getState().autoDisableProtectionIfEmpty();
    expect(mRemoveCartLine).not.toHaveBeenCalled();
  });

  it('is a no-op while a mutation is pending (never races an in-flight op)', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: [protectionLine(1.0, PROTECTION_VARIANTS[0].id)], status: 'pending' });
    await useCart.getState().autoDisableProtectionIfEmpty();
    expect(mRemoveCartLine).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// selectMerchandiseCount (bag badge)
// ---------------------------------------------------------------------------

describe('selectMerchandiseCount', () => {
  it('sums the quantities of merchandise lines only (excludes the protection line)', () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merch = { ...singleCart.lines[0], quantity: 3 };
    const items: CartLine[] = [merch, protectionLine(1.0, PROTECTION_VARIANTS[0].id)];
    expect(selectMerchandiseCount(items, PROTECTION_VARIANTS)).toBe(3);
  });

  it('returns 0 when only the protection line is present (no phantom badge count)', () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const items: CartLine[] = [protectionLine(1.0, PROTECTION_VARIANTS[0].id)];
    expect(selectMerchandiseCount(items, PROTECTION_VARIANTS)).toBe(0);
  });

  it('counts ALL lines as merchandise when no protection config is set', () => {
    const items: CartLine[] = [{ ...singleCart.lines[0], quantity: 2 }];
    expect(selectMerchandiseCount(items, [])).toBe(2);
  });

  it('sums quantities across multiple merchandise lines (never lines.length)', () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const items: CartLine[] = [
      { ...singleCart.lines[0], quantity: 2 },
      { ...singleCart.lines[0], lineId: 'gid://shopify/CartLine/second', quantity: 5 },
      protectionLine(1.0, PROTECTION_VARIANTS[0].id),
    ];
    expect(selectMerchandiseCount(items, PROTECTION_VARIANTS)).toBe(7); // 2 + 5, not 2 rows
  });
});

describe('setProtectionConfig', () => {
  it('stores the variants + rate shipped from the server', () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const s = useCart.getState();
    expect(s.protectionVariants).toEqual(PROTECTION_VARIANTS);
    expect(s.protectionRate).toBe(PROTECTION_RATE);
  });

  it('clears the config on null (protection product not visible to the Storefront API)', () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.getState().setProtectionConfig(null);
    const s = useCart.getState();
    expect(s.protectionVariants).toEqual([]);
    expect(s.protectionRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// useHasShippingProtection
// ---------------------------------------------------------------------------

describe('selectHasShippingProtection', () => {
  it('is false when no protection line is cached', () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: singleCart.lines.slice() });
    expect(selectHasShippingProtection(useCart.getState().items, useCart.getState().protectionVariants)).toBe(false);
  });

  it('is true when a real protection line is cached (matches by merchandiseId)', () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: [protectionLine(1.0, PROTECTION_VARIANTS[0].id)] });
    expect(selectHasShippingProtection(useCart.getState().items, useCart.getState().protectionVariants)).toBe(true);
  });

  it('ignores provisional (tmp-) protection lines', () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({
      items: [{ ...protectionLine(1.0, PROTECTION_VARIANTS[0].id), lineId: 'tmp-protection-x' }],
    });
    expect(selectHasShippingProtection(useCart.getState().items, useCart.getState().protectionVariants)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggleShippingProtection
// ---------------------------------------------------------------------------

describe('toggleShippingProtection', () => {
  it('is a no-op when no protection config is set (product not visible)', async () => {
    // merchandise subtotal $50 → tier $1.00, but no variants configured.
    useCart.setState({ items: [{ ...singleCart.lines[0], price: 50, quantity: 1 }], totalQuantity: 1 });
    await useCart.getState().toggleShippingProtection(true);
    expect(mAddToCart).not.toHaveBeenCalled();
    expect(useCart.getState().items).toHaveLength(1);
  });

  it('turning ON: optimistically adds a provisional protection line, then reconciles with the server', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    // Merchandise subtotal $50 → target $1.00 → tier $1.00 (variant[0]).
    useCart.setState({ items: [{ ...singleCart.lines[0], price: 50, quantity: 1 }], totalQuantity: 1 });

    // Keep addToCart pending so the optimistic provisional line is observable.
    let resolveAdd!: (c: Cart) => void;
    mAddToCart.mockReturnValue(new Promise<Cart>((r) => { resolveAdd = r; }));
    const promise = useCart.getState().toggleShippingProtection(true);
    const mid = useCart.getState();
    expect(mid.status).toBe('pending');
    const prov = mid.items.find((i) => i.lineId.startsWith('tmp-protection-'));
    expect(prov).toBeTruthy();
    expect(prov!.merchandiseId).toBe(PROTECTION_VARIANTS[0].id);
    expect(prov!.price).toBe(1.0);
    expect(prov!.quantity).toBe(1);
    // The optimistic provisional line is shown instantly (above). The addToCart
    // server call runs inside the serial mutation queue (one microtask later),
    // so flush a tick before asserting it was dispatched with a NO-price payload.
    await Promise.resolve();
    expect(mAddToCart).toHaveBeenCalledWith({ merchandiseId: PROTECTION_VARIANTS[0].id, quantity: 1 });

    // Resolve → server cart wins. Server cart has the real protection line.
    const serverCart: Cart = {
      ...singleCart,
      lines: [
        { ...singleCart.lines[0], price: 50, quantity: 1 },
        protectionLine(1.0, PROTECTION_VARIANTS[0].id),
      ],
      totalQuantity: 2,
      subtotalAmount: 51,
    };
    resolveAdd(serverCart);
    await promise;
    const end = useCart.getState();
    expect(end.status).toBe('idle');
    expect(end.items).toEqual(serverCart.lines);
    expect(end.totalQuantity).toBe(2);
  });

  it('turning ON: rolls back the provisional line on error (no half-added state)', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: [{ ...singleCart.lines[0], price: 50, quantity: 1 }], totalQuantity: 1 });
    mAddToCart.mockRejectedValue(new Error('We could not update your bag. Please try again.'));
    await useCart.getState().toggleShippingProtection(true);
    const s = useCart.getState();
    expect(s.status).toBe('error');
    expect(s.items).toHaveLength(1); // only the merchandise line remains
    expect(s.items.every((i) => !i.lineId.startsWith('tmp-protection-'))).toBe(true);
  });

  it('turning ON: is a no-op when protection is already on (no double-add)', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: [protectionLine(1.0, PROTECTION_VARIANTS[0].id)] });
    await useCart.getState().toggleShippingProtection(true);
    expect(mAddToCart).not.toHaveBeenCalled();
  });

  it('turning OFF: optimistically removes the protection line and reconciles', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merchLine = { ...singleCart.lines[0], price: 50, quantity: 1 };
    useCart.setState({ items: [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)], totalQuantity: 2 });
    mRemoveCartLine.mockResolvedValue({ ...singleCart, lines: [merchLine], totalQuantity: 1, subtotalAmount: 50 });
    await useCart.getState().toggleShippingProtection(false);
    const s = useCart.getState();
    expect(s.status).toBe('idle');
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toEqual(merchLine); // merchandise line kept, protection gone
    expect(mRemoveCartLine).toHaveBeenCalledWith({ lineId: PROTECTION_LINE_ID });
  });

  it('turning OFF: re-hydrates from the server on error', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merchLine = { ...singleCart.lines[0], price: 50, quantity: 1 };
    const both = [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)];
    useCart.setState({ items: both, totalQuantity: 2 });
    mRemoveCartLine.mockRejectedValue(new Error('boom'));
    // Server still has both lines.
    mGetCart.mockResolvedValue({ ...singleCart, lines: both, totalQuantity: 2, subtotalAmount: 51 });
    await useCart.getState().toggleShippingProtection(false);
    expect(mGetCart).toHaveBeenCalled();
    expect(useCart.getState().items).toHaveLength(2); // restored
  });

  it('turning OFF with no protection line is a no-op', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: [singleCart.lines[0]] });
    await useCart.getState().toggleShippingProtection(false);
    expect(mRemoveCartLine).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// reconcileProtectionVariant
// ---------------------------------------------------------------------------

describe('reconcileProtectionVariant', () => {
  it('swaps to the correct tier when the subtotal crosses a boundary', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    // Merchandise subtotal $100 → target $2.00 → nearest tier $2.01 (variant[1]),
    // but the cached protection line is still the $1.00 tier (variant[0]).
    const merchLine = { ...singleCart.lines[0], price: 100, quantity: 1 };
    useCart.setState({
      items: [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)],
      totalQuantity: 2,
      status: 'idle',
    });
    const swapped: Cart = {
      ...singleCart,
      lines: [merchLine, protectionLine(2.01, PROTECTION_VARIANTS[1].id)],
      totalQuantity: 2,
      subtotalAmount: 102.01,
    };
    mSwap.mockResolvedValue(swapped);
    await useCart.getState().reconcileProtectionVariant();
    expect(mSwap).toHaveBeenCalledWith({
      oldLineId: PROTECTION_LINE_ID,
      newMerchandiseId: PROTECTION_VARIANTS[1].id,
    });
    const s = useCart.getState();
    expect(s.status).toBe('idle');
    expect(s.items).toEqual(swapped.lines);
  });

  it('is a no-op when the protection line is already the correct tier', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    // Subtotal $50 → tier $1.00; protection line is already $1.00 → no swap.
    const merchLine = { ...singleCart.lines[0], price: 50, quantity: 1 };
    useCart.setState({
      items: [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)],
      status: 'idle',
    });
    await useCart.getState().reconcileProtectionVariant();
    expect(mSwap).not.toHaveBeenCalled();
  });

  it('is a no-op when protection is off (no protection line)', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    useCart.setState({ items: [singleCart.lines[0]], status: 'idle' });
    await useCart.getState().reconcileProtectionVariant();
    expect(mSwap).not.toHaveBeenCalled();
  });

  it('does NOT swap while another mutation is pending (avoids racing)', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merchLine = { ...singleCart.lines[0], price: 100, quantity: 1 };
    useCart.setState({
      items: [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)],
      status: 'pending',
    });
    await useCart.getState().reconcileProtectionVariant();
    expect(mSwap).not.toHaveBeenCalled();
  });

  it('re-hydrates from the server when the (non-atomic) swap fails', async () => {
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merchLine = { ...singleCart.lines[0], price: 100, quantity: 1 };
    const both = [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)];
    useCart.setState({ items: both, status: 'idle' });
    mSwap.mockRejectedValue(new Error('boom'));
    // Re-hydration returns the server's truth (protection may have been removed
    // by the failed swap's remove step).
    mGetCart.mockResolvedValue({ ...singleCart, lines: [merchLine], totalQuantity: 1, subtotalAmount: 100 });
    await useCart.getState().reconcileProtectionVariant();
    expect(mGetCart).toHaveBeenCalled();
    expect(useCart.getState().items).toHaveLength(1); // protection gone, per server
  });

  it('does NOT launch a duplicate tier-swap when a setQuantity races an in-flight swap (serial queue)', async () => {
    // Reproduces the user-reported 500: clicking + while a protection tier-swap
    // is mid-flight used to let setQuantity's applyCart flip status to idle,
    // causing the reconcile effect to fire a SECOND swap on a protection line
    // the first swap had already removed → "merchandise line … does not exist".
    // The serial mutation queue prevents the two server calls from overlapping.
    useCart.getState().setProtectionConfig({ variants: PROTECTION_VARIANTS, rate: PROTECTION_RATE });
    const merchLine = { ...singleCart.lines[0], price: 50, quantity: 1 };
    useCart.setState({
      items: [merchLine, protectionLine(1.0, PROTECTION_VARIANTS[0].id)],
      totalQuantity: 2,
      status: 'idle',
    });

    // Keep swap#1 pending so we can race a setQuantity against it. The
    // updateCartLine mock preserves whatever protection line is currently cached
    // (the server doesn't touch protection on a merch-qty update) so a post-swap
    // qty change doesn't spuriously look like another tier cross.
    let swapResolve!: (c: Cart) => void;
    mSwap.mockReturnValue(new Promise<Cart>((r) => { swapResolve = r; }));
    mUpdateCartLine.mockImplementation(async ({ quantity }) => {
      const protIds = new Set(PROTECTION_VARIANTS.map((v) => v.id));
      const prot = useCart.getState().items.find((i) => protIds.has(i.merchandiseId));
      const protLine = prot ?? protectionLine(1.0, PROTECTION_VARIANTS[0].id);
      return {
        ...singleCart,
        lines: [{ ...merchLine, quantity }, protLine],
        totalQuantity: quantity + 1,
        subtotalAmount: 50 * quantity + protLine.price,
      };
    });

    // Step A: qty 1 → 2 (subtotal $100 → tier $2.01). setQuantity's server call
    // runs (queue empty) → applyCart idle; reconcile then launches swap#1 on L1.
    await useCart.getState().setQuantity(merchLine.lineId, 2);
    const recon1 = useCart.getState().reconcileProtectionVariant();
    await Promise.resolve(); // let reconcile acquire the queue + dispatch swap#1
    expect(mSwap).toHaveBeenCalledTimes(1);

    // Step B: click + to 3 WHILE swap#1 is still pending, then a reconcile fires
    // (the effect on items change). Both queue behind swap#1 — neither runs, so
    // no second swap is dispatched.
    const setQty3 = useCart.getState().setQuantity(merchLine.lineId, 3);
    await Promise.resolve();
    await Promise.resolve();
    const recon2 = useCart.getState().reconcileProtectionVariant();
    await Promise.resolve();
    await Promise.resolve();
    expect(mSwap).toHaveBeenCalledTimes(1); // the race no longer dupes the swap

    // Resolve swap#1 → cart now has the tier-2 protection line (L2). The queued
    // setQty3 + reconcile run after; reconcile sees L2 = tier 2 → no swap.
    swapResolve({
      ...singleCart,
      lines: [{ ...merchLine, quantity: 2 }, protectionLine(2.01, PROTECTION_VARIANTS[1].id)],
      totalQuantity: 3,
      subtotalAmount: 102.01,
    });
    await Promise.all([recon1, recon2, setQty3]);
    expect(mSwap).toHaveBeenCalledTimes(1); // exactly one swap for the whole sequence
  });
});
