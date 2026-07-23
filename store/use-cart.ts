import { create } from 'zustand';

import type { Cart, CartLine } from '@/lib/types';
import { merchandiseLinesOf, protectionLineOf } from '@/lib/protection';
import {
  addToCart,
  updateCartLine,
  removeCartLine,
  clearCart as clearCartAction,
  getCart,
} from '@/app/cart/actions';

// ---------------------------------------------------------------------------
// Cart store — an OPTIMISTIC CACHE over the Shopify cart.
//
// The browser never talks to Shopify directly. Each mutation updates the UI
// instantly (optimistic), calls a cart server action (app/cart/actions.ts),
// then reconciles with the authoritative `Cart` the action returns. Shopify is
// the source of truth: `totalQuantity`, totals, and line identity all come from
// the server response, never from the client's own arithmetic.
//
// Cart-line identity: items are keyed by the Shopify CART-LINE GID
// (`lineId`), which is what cartLinesUpdate / cartLinesRemove require. The
// variant GID (`merchandiseId`) is only used to CREATE a line. Shopify merges
// same-variant lines server-side, so this store does NO local merge — the old
// `lineKey(id, size)` logic is gone.
//
// No `persist` middleware: the cart rehydrates from Shopify on mount
// (components/CartHydrator.tsx → getCart() → hydrateFromServer). The only
// persisted cart state is the opaque cart id in the HTTP-only cookie, handled
// by the server actions.
//
// `MAX_QTY_PER_LINE` is a CLIENT-SIDE UX clamp only (disables the + stepper at
// 10). The server does not mirror it — Shopify enforces its own limits.
// ---------------------------------------------------------------------------

/** Client-side UX clamp for the quantity stepper. */
export const MAX_QTY_PER_LINE = 10;

/** Clamp an incoming quantity to a safe 1..MAX integer for optimistic display. */
function clampQty(qty: number): number {
  return Math.max(1, Math.min(Math.floor(qty), MAX_QTY_PER_LINE));
}

/** Sum of line quantities from a cached items array (used for rollback only). */
function totalQuantityOf(items: CartLine[]): number {
  return items.reduce((acc, i) => acc + i.quantity, 0);
}

/** Optimistic merchandise subtotal from cached lines (display only). */
function subtotalOf(items: CartLine[]): number {
  return items.reduce((acc, i) => acc + i.price * i.quantity, 0);
}

/** Input for addItem: everything needed to show a line optimistically, except
 *  `lineId` (synthetic until the server responds) and `quantity` (passed separately).
 *  `merchandiseId` is optional only so organizer QuickAdd (Phase 4 — no variant
 *  GID yet) can call addItem and get a graceful "not available" error instead of
 *  a crash. Real product adds always supply it. `variantLabel` is the descriptor
 *  shown under the line (e.g. "Black / large" or "Small"); the caller builds it
 *  to match what the server's lineLabel will produce so the optimistic line and
 *  the reconciled server line never flicker. */
export interface AddItemInput {
  merchandiseId?: string;
  name: string;
  price: number;
  variantLabel: string;
  image: string;
  currencyCode?: string;
  // The product's handle, when the caller knows it (the reconciled server line
  // always carries it). Feeds lib/protection.ts detection for optimistic lines.
  productHandle?: string;
}

type Status = 'idle' | 'pending' | 'error';

interface CartState {
  // Drawer UI.
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;

  // Optimistic cache of the Shopify cart.
  items: CartLine[];
  totalQuantity: number; // from Shopify cart.totalQuantity — drives the bag badge
  subtotalAmount: number; // merchandise subtotal (optimistically recomputed)
  totalAmount: number; // estimated total (authoritative from server)
  totalAmountEstimated: boolean;
  currencyCode: string;
  checkoutUrl: string;

  // Mutation status for pending/error UI.
  status: Status;
  error: string | null;

  // Mutations (async — optimistic + reconcile).
  // addItem opens the drawer by default (it is the buyer's action — feedback
  // belongs on screen). SYSTEM adds (the shipping-protection toggle and the
  // tier-swap chain) pass { open: false } so they can never yank the drawer
  // back open after the buyer has closed it, or pop it over the /cart page.
  addItem: (item: AddItemInput, qty?: number, opts?: { open?: boolean }) => Promise<void>;
  setQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
  clearCart: () => Promise<void>;

  // Replace the cache from a server Cart snapshot (called on mount + on error recovery).
  hydrateFromServer: (cart: Cart | null) => void;
}

/** Apply an authoritative server Cart to the store (idle, no error). */
function applyCart(state: CartState, cart: Cart): Partial<CartState> {
  return {
    items: cart.lines,
    totalQuantity: cart.totalQuantity,
    subtotalAmount: cart.subtotalAmount,
    totalAmount: cart.totalAmount,
    totalAmountEstimated: cart.totalAmountEstimated,
    currencyCode: cart.currencyCode,
    checkoutUrl: cart.checkoutUrl,
    status: 'idle',
    error: null,
  };
}

/**
 * Apply the server cart, then sweep one edge case Shopify will not: a
 * protection line with NO merchandise left in the bag. The drawer and /cart
 * hide the protection row once the bag is empty, so an orphaned line would
 * ride invisibly to checkout as a charge the buyer can't see or remove. The
 * sweep reads only the POST-MUTATION server cart (never optimistic state), so
 * it can't fight the buyer; its own reconcile re-checks the condition and
 * stops (no loop). A failed sweep is non-fatal — the next hydration
 * converges the cart.
 */
async function applyCartWithProtectionSweep(cart: Cart, apply: (cart: Cart) => void): Promise<void> {
  apply(cart);
  if (merchandiseLinesOf(cart.lines).length > 0) return;
  const orphan = protectionLineOf(cart.lines);
  if (!orphan) return;
  try {
    apply(await removeCartLine({ lineId: orphan.lineId }));
  } catch {
    // Non-fatal — converge on the next hydration instead.
  }
}

const initialState = {
  isOpen: false,
  items: [] as CartLine[],
  totalQuantity: 0,
  subtotalAmount: 0,
  totalAmount: 0,
  totalAmountEstimated: true,
  currencyCode: 'USD',
  checkoutUrl: '',
  status: 'idle' as Status,
  error: null as string | null,
};

export const useCart = create<CartState>()((set, get) => ({
  ...initialState,

  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
  toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),

  addItem: async (item, qty = 1, opts) => {
    // Organizer QuickAdd (Phase 4) has no variant GID — reject gracefully.
    if (!item.merchandiseId) {
      set({
        isOpen: true,
        status: 'error',
        error: 'This item is not available for online checkout yet.',
      });
      return;
    }

    // System adds (protection toggle / tier swap) keep the drawer as-is.
    const open = opts?.open !== false;
    const quantity = clampQty(qty);
    const provLineId = `tmp-${item.merchandiseId}-${Date.now()}`;
    const provisional: CartLine = {
      lineId: provLineId,
      merchandiseId: item.merchandiseId,
      name: item.name,
      productHandle: item.productHandle ?? '',
      price: item.price,
      variantLabel: item.variantLabel,
      image: item.image,
      currencyCode: item.currencyCode ?? 'USD',
      quantity,
    };

    // Optimistic: show the line instantly, open the drawer (unless the caller
    // opted out), mark pending.
    set((s) => {
      const items = [...s.items, provisional];
      return {
        ...(open ? { isOpen: true } : {}),
        status: 'pending',
        error: null,
        items,
        totalQuantity: s.totalQuantity + quantity,
        subtotalAmount: subtotalOf(items),
        totalAmount: subtotalOf(items),
      };
    });

    try {
      const cart = await addToCart({ merchandiseId: item.merchandiseId, quantity });
      await applyCartWithProtectionSweep(cart, (c) => set((s) => ({ ...applyCart(s, c) })));
    } catch (e) {
      // Roll back the provisional line; recompute totals from what remains.
      set((s) => {
        const items = s.items.filter((i) => i.lineId !== provLineId);
        return {
          status: 'error',
          error: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
          items,
          totalQuantity: totalQuantityOf(items),
          subtotalAmount: subtotalOf(items),
          totalAmount: subtotalOf(items),
        };
      });
    }
  },

  setQuantity: async (lineId, quantity) => {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty)) return;

    // Optimistic: update (or drop, if qty ≤ 0) the line instantly.
    set((s) => {
      const items =
        qty <= 0
          ? s.items.filter((i) => i.lineId !== lineId)
          : s.items.map((i) => (i.lineId === lineId ? { ...i, quantity: clampQty(qty) } : i));
      return {
        status: 'pending',
        error: null,
        items,
        totalQuantity: totalQuantityOf(items),
        subtotalAmount: subtotalOf(items),
        totalAmount: subtotalOf(items),
      };
    });

    try {
      const cart = await updateCartLine({ lineId, quantity: qty });
      await applyCartWithProtectionSweep(cart, (c) => set((s) => ({ ...applyCart(s, c) })));
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      });
      // Reconcile with the server's truth — the optimistic change may not have applied.
      try {
        const cart = await getCart();
        get().hydrateFromServer(cart);
      } catch {
        // Network still down — keep the error state; the cache may be stale.
      }
    }
  },

  removeItem: async (lineId) => {
    set((s) => {
      const items = s.items.filter((i) => i.lineId !== lineId);
      return {
        status: 'pending',
        error: null,
        items,
        totalQuantity: totalQuantityOf(items),
        subtotalAmount: subtotalOf(items),
        totalAmount: subtotalOf(items),
      };
    });

    try {
      const cart = await removeCartLine({ lineId });
      await applyCartWithProtectionSweep(cart, (c) => set((s) => ({ ...applyCart(s, c) })));
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      });
      try {
        const cart = await getCart();
        get().hydrateFromServer(cart);
      } catch {
        // keep error state
      }
    }
  },

  clearCart: async () => {
    // Optimistically empty the cache; the server action just clears the cookie.
    set({
      items: [],
      totalQuantity: 0,
      subtotalAmount: 0,
      totalAmount: 0,
      status: 'idle',
      error: null,
    });
    try {
      await clearCartAction();
    } catch {
      // Cookie-clear failure is non-fatal for the UI.
    }
  },

  hydrateFromServer: (cart) => {
    if (!cart) {
      set({ items: [], totalQuantity: 0, subtotalAmount: 0, totalAmount: 0, status: 'idle', error: null });
      return;
    }
    set((s) => ({ ...applyCart(s, cart) }));
  },
}));
