import { create } from 'zustand';

import type { Cart, CartLine } from '@/lib/types';
import type { ProtectionContent, ProtectionVariant } from '@/lib/shipping-protection/types';
import { DEFAULT_PROTECTION_CONTENT } from '@/lib/shipping-protection/types';
import {
  addToCart,
  updateCartLine,
  removeCartLine,
  clearCart as clearCartAction,
  getCart,
  swapShippingProtection,
} from '@/app/cart/actions';
// Pure, client-safe protection helpers (NO `server-only` — safe to import here).
// These are the SINGLE source of the subtotal→tier formula, shared by the store
// and the toggle UI so they can never disagree on which variant/fee applies.
import {
  computeProtectionOffering,
  isProtectionLine as isProtectionLineOf,
  merchandiseSubtotalOf,
} from '@/lib/shipping-protection/ladder';

export { isProtectionLineOf as isProtectionLine };

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

/**
 * The MERCHANDISE item count for the bag badge: the sum of quantities of all
 * NON-protection lines. Captain shipping protection is a service opt-in shown as
 * a toggle (not a cart row), so it must NOT inflate the "items in bag" count —
 * otherwise the badge shows "1" with no visible product when protection is the
 * only line. Still a SUM OF QUANTITIES (never `lines.length`) — the AGENTS.md
 * badge invariant's method is preserved; only the protection service line is
 * excluded, which is the desired UX. `variants` empty (protection unavailable)
 * → counts every line as merchandise.
 */
export function selectMerchandiseCount(
  items: CartLine[],
  variants: ProtectionVariant[],
): number {
  return items
    .filter((i) => !isProtectionLineOf(i, variants))
    .reduce((acc, i) => acc + i.quantity, 0);
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

  // Captain shipping-protection config — plain serializable data shipped from
  // the server via getProtectionConfig (the ONLY way protection data crosses to
  // the client). Empty when the protection product is not visible to the
  // Storefront API (the toggle renders nothing; the feature degrades silently).
  protectionVariants: ProtectionVariant[];
  protectionRate: number;
  // Merchant-editable toggle content (copy + enabled flag) from the
  // shipping_protection_content metaobject. Defaults to DEFAULT_PROTECTION_CONTENT
  // until the server config loads (or when the metaobject is absent).
  protectionContent: ProtectionContent;
  setProtectionConfig: (
    cfg: { variants: ProtectionVariant[]; rate: number; content: ProtectionContent } | null,
  ) => void;

  // Mutations (async — optimistic + reconcile).
  addItem: (item: AddItemInput, qty?: number) => Promise<void>;
  setQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
  clearCart: () => Promise<void>;

  // Shipping-protection toggle. `on` = add the correct price-laddered variant
  // (qty 1); `off` = remove the protection line. Optimistic + reconcile, like
  // the other mutations. The browser never picks a variant id or sends a price
  // — the variant is resolved from the server-shipped config + cart subtotal.
  toggleShippingProtection: (on: boolean) => Promise<void>;
  // After a subtotal change, swap the protection line to the correct tier if it
  // has crossed a boundary. No-op when protection is off or another mutation is
  // pending (avoids racing a swap against an in-flight add/remove).
  reconcileProtectionVariant: () => Promise<void>;
  // Safety net: if no merchandise lines remain but a protection line is still
  // present (e.g. an orphan persisted from a prior session, or a provisional
  // protection line resolved after the last product was removed), turn
  // protection off so the cart empties. No-op when protection is off / cart has
  // merchandise / a mutation is pending.
  autoDisableProtectionIfEmpty: () => Promise<void>;

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

// ---------------------------------------------------------------------------
// Serial mutation queue — ONLY ONE Shopify-mutating store action runs at a time.
//
// WHY: every successful server response flows through `applyCart`, which flips
// `status` to 'idle'. Only `reconcileProtectionVariant` guards on
// `status === 'idle'`; the user-facing mutations (setQuantity, removeItem, …)
// did NOT, so they ran concurrently with an in-flight tier-swap. The race:
// swap#1 is mid-flight (removing protection line L1) → a concurrent setQuantity
// resolves first → applyCart sets status 'idle' → ProtectionHydrator's reconcile
// effect fires, sees 'idle' + the still-cached L1 + a tier mismatch → launches
// swap#2 on the SAME L1 → swap#1 already removed L1 → Shopify "merchandise line
// … does not exist" 500, and the bag count bounces (swap removes + re-adds the
// protection line) until the buyer stops clicking.
//
// HOW: each mutating action applies its OPTIMISTIC update immediately (instant
// UI — the queue only orders the server calls), then awaits `runSerial` for the
// Shopify round-trip. A failed task never poisons the queue.
// ---------------------------------------------------------------------------
let mutationQueue: Promise<unknown> = Promise.resolve();
function runSerial<T>(task: () => Promise<T>): Promise<T> {
  // Run `task` after the prior task settles (whether it resolved or rejected).
  const result = mutationQueue.then(task, task);
  // Swallow the chain's rejection so one failure can't block later mutations;
  // `result` (returned to the caller) still retains the rejection for its catch.
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Test-only: reset the serial mutation queue to a fresh, idle promise. The
 * queue is module-level (it outlives any single store instance), so without a
 * reset a test that does not await a fire-and-forget mutation leaves the queue
 * chained to an unsettled task and every later test's mutation hangs. Production
 * code never calls this — the queue simply runs for the lifetime of the module.
 */
export function __resetCartMutationQueueForTests(): void {
  mutationQueue = Promise.resolve();
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
  protectionVariants: [] as ProtectionVariant[],
  protectionRate: 0,
  protectionContent: DEFAULT_PROTECTION_CONTENT,
};

/**
 * Find the protection line currently in the cache, if any. Excludes provisional
 * (`tmp-`) lines — a provisional protection line is mid-add and has no real
 * Shopify line id to remove/swap yet. Returns the REAL protection line only.
 */
function protectionLineOf(items: CartLine[], variants: ProtectionVariant[]): CartLine | null {
  return items.find((i) => !i.lineId.startsWith('tmp-') && isProtectionLineOf(i, variants)) ?? null;
}

/**
 * Should removing `removingLineId` ALSO drop the protection line? Yes when, after
 * this removal, NO merchandise lines remain but a real protection line is still
 * present — i.e. the buyer removed the last product while protection was on.
 * Protection only makes sense with products to protect, so it is cleared
 * together with the last product so the cart empties cleanly (shows the empty
 * state instead of an orphan protection line). Returns the protection line id
 * to also remove, or `null`. No-op when protection is unavailable / already off
 * / the line being removed IS the protection line / merchandise would remain.
 */
function protectionLineToDropOnRemove(
  items: CartLine[],
  removingLineId: string,
  variants: ProtectionVariant[],
): string | null {
  if (variants.length === 0) return null;
  const prot = protectionLineOf(items, variants);
  if (!prot || prot.lineId === removingLineId) return null;
  const remainingMerch = items.filter(
    (i) => i.lineId !== removingLineId && !isProtectionLineOf(i, variants),
  );
  return remainingMerch.length === 0 ? prot.lineId : null;
}

/**
 * Pure derivation: is shipping protection currently in the cart? True when any
 * REAL (non-provisional) cached line matches a protection variant. Extracted as
 * a pure function so it unit-tests in the node Vitest env (the hook below
 * delegates to it) and so the toggle UI can derive `checked` from raw state
 * without a React render context.
 */
export function selectHasShippingProtection(
  items: CartLine[],
  variants: ProtectionVariant[],
): boolean {
  return items.some((i) => !i.lineId.startsWith('tmp-') && isProtectionLineOf(i, variants));
}

/**
 * Derived selector hook: is shipping protection currently in the cart? The cart
 * is the source of truth, so this survives rehydration (the toggle's `checked`
 * state is derived from it, not from local component state that could desync).
 */
export function useHasShippingProtection(): boolean {
  return useCart((s) => selectHasShippingProtection(s.items, s.protectionVariants));
}

export const useCart = create<CartState>()((set, get) => ({
  ...initialState,

  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
  toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),

  addItem: async (item, qty = 1) => {
    // Organizer QuickAdd (Phase 4) has no variant GID — reject gracefully.
    if (!item.merchandiseId) {
      set({
        isOpen: true,
        status: 'error',
        error: 'This item is not available for online checkout yet.',
      });
      return;
    }

    const quantity = clampQty(qty);
    // Capture the narrowed merchandiseId (string) here, before the runSerial
    // closure below — TypeScript does not carry the `if (!item.merchandiseId)`
    // narrowing into the closure, so referencing `item.merchandiseId` there
    // would widen back to `string | undefined`.
    const merchandiseId = item.merchandiseId;
    const provLineId = `tmp-${merchandiseId}-${Date.now()}`;
    const provisional: CartLine = {
      lineId: provLineId,
      merchandiseId: item.merchandiseId,
      name: item.name,
      price: item.price,
      variantLabel: item.variantLabel,
      image: item.image,
      currencyCode: item.currencyCode ?? 'USD',
      quantity,
    };

    // Optimistic: show the line instantly, open the drawer, mark pending.
    set((s) => {
      const items = [...s.items, provisional];
      return {
        isOpen: true,
        status: 'pending',
        error: null,
        items,
        totalQuantity: s.totalQuantity + quantity,
        subtotalAmount: subtotalOf(items),
        totalAmount: subtotalOf(items),
      };
    });

    // Serialize the server call so it never overlaps another Shopify mutation
    // (see runSerial). The provisional line is already shown above.
    await runSerial(async () => {
      try {
        const cart = await addToCart({ merchandiseId, quantity });
        set((s) => ({ ...applyCart(s, cart) }));
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
    });
  },

  setQuantity: async (lineId, quantity) => {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty)) return;

    // Removing the line (qty ≤ 0)? If it is the last merchandise line and
    // protection is on, drop protection too so the cart empties cleanly.
    const dropProtectionId =
      qty <= 0 ? protectionLineToDropOnRemove(get().items, lineId, get().protectionVariants) : null;

    // Optimistic: update (or drop, if qty ≤ 0) the line instantly — plus the
    // protection line when the last product is being removed.
    set((s) => {
      let items =
        qty <= 0
          ? s.items.filter((i) => i.lineId !== lineId)
          : s.items.map((i) => (i.lineId === lineId ? { ...i, quantity: clampQty(qty) } : i));
      if (dropProtectionId) items = items.filter((i) => i.lineId !== dropProtectionId);
      return {
        status: 'pending',
        error: null,
        items,
        totalQuantity: totalQuantityOf(items),
        subtotalAmount: subtotalOf(items),
        totalAmount: subtotalOf(items),
      };
    });

    // Serialize the server call(s) so they never overlap another Shopify mutation
    // (see runSerial). The optimistic update is already applied above.
    await runSerial(async () => {
      try {
        const cart = await updateCartLine({ lineId, quantity: qty });
        if (dropProtectionId) {
          // Remove the orphan protection line too; the server cart from the
          // update still has it, so this second call clears it.
          const cart2 = await removeCartLine({ lineId: dropProtectionId });
          set((s) => ({ ...applyCart(s, cart2) }));
        } else {
          set((s) => ({ ...applyCart(s, cart) }));
        }
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
    });
  },

  removeItem: async (lineId) => {
    // If this is the last merchandise line and protection is on, drop protection
    // too so the cart empties cleanly (no orphan protection line / "bag not
    // empty" when the last product is removed with protection enabled).
    const dropProtectionId = protectionLineToDropOnRemove(
      get().items,
      lineId,
      get().protectionVariants,
    );
    const removeIds = dropProtectionId ? [lineId, dropProtectionId] : [lineId];

    set((s) => {
      const items = s.items.filter((i) => !removeIds.includes(i.lineId));
      return {
        status: 'pending',
        error: null,
        items,
        totalQuantity: totalQuantityOf(items),
        subtotalAmount: subtotalOf(items),
        totalAmount: subtotalOf(items),
      };
    });

    // Serialize the server call(s) so they never overlap another Shopify mutation
    // (see runSerial). The optimistic removal is already applied above.
    await runSerial(async () => {
      try {
        const cart = await removeCartLine({ lineId });
        if (dropProtectionId) {
          // Remove the orphan protection line; the cart returned above still has
          // it, so this second call clears it and yields the truly empty cart.
          const cart2 = await removeCartLine({ lineId: dropProtectionId });
          set((s) => ({ ...applyCart(s, cart2) }));
        } else {
          set((s) => ({ ...applyCart(s, cart) }));
        }
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
    });
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

  // -------------------------------------------------------------------------
  // Shipping protection
  // -------------------------------------------------------------------------

  setProtectionConfig: (cfg) => {
    if (!cfg) {
      set({ protectionVariants: [], protectionRate: 0, protectionContent: DEFAULT_PROTECTION_CONTENT });
      return;
    }
    set({ protectionVariants: cfg.variants, protectionRate: cfg.rate, protectionContent: cfg.content });
  },

  toggleShippingProtection: async (on) => {
    const { items, protectionVariants, protectionRate, currencyCode } = get();
    if (protectionVariants.length === 0) return; // protection unavailable — no-op

    if (!on) {
      // Turn OFF: remove the real protection line (optimistic + reconcile),
      // mirroring removeItem. A provisional protection line (mid-add) is left
      // to its own add to resolve — the UI disables the toggle while pending.
      const line = protectionLineOf(items, protectionVariants);
      if (!line) return;
      const removeLineId = line.lineId;
      set((s) => {
        const next = s.items.filter((i) => i.lineId !== removeLineId);
        return {
          status: 'pending',
          error: null,
          items: next,
          totalQuantity: totalQuantityOf(next),
          subtotalAmount: subtotalOf(next),
          totalAmount: subtotalOf(next),
        };
      });
      // Serialize the server call (see runSerial). If a queued op already
      // removed this line, removeCartLine treats "does not exist" as success
      // (idempotent) and returns the current cart — no 500, no desync.
      await runSerial(async () => {
        try {
          const cart = await removeCartLine({ lineId: removeLineId });
          set((s) => ({ ...applyCart(s, cart) }));
        } catch (e) {
          set({ status: 'error', error: e instanceof Error ? e.message : 'Something went wrong. Please try again.' });
          try {
            const cart = await getCart();
            get().hydrateFromServer(cart);
          } catch {
            // keep error state
          }
        }
      });
      return;
    }

    // Turn ON: resolve the correct tier from the MERCHANDISE subtotal (excludes
    // any protection line, so the fee can't inflate its own tier). If a
    // protection line already exists, this is a no-op. The OFF path above is
    // intentionally NOT gated by `enabled` — when the merchant disables the
    // feature from Shopify, the Hydrator calls toggle(false) to remove the line.
    if (!get().protectionContent.enabled) return; // feature disabled in Shopify — no opt-in
    if (protectionLineOf(items, protectionVariants)) return;
    const offering = computeProtectionOffering(items, protectionVariants, protectionRate);
    if (!offering) return; // no grid tiers — protection unavailable, no-op

    // Capture the narrowed offering's merchandiseId before the runSerial closure
    // below — TypeScript does not carry the `if (!offering) return` narrowing
    // into the closure, so referencing `offering.merchandiseId` there would
    // widen back to `string | undefined`.
    const offeringMerchandiseId = offering.merchandiseId;
    const provLineId = `tmp-protection-${offeringMerchandiseId}-${Date.now()}`;
    const provisional: CartLine = {
      lineId: provLineId,
      merchandiseId: offering.merchandiseId,
      name: 'Shipping Protection',
      price: offering.fee,
      variantLabel: '',
      image: '',
      currencyCode,
      quantity: 1,
    };
    set((s) => {
      const next = [...s.items, provisional];
      return {
        status: 'pending',
        error: null,
        items: next,
        totalQuantity: totalQuantityOf(next),
        subtotalAmount: subtotalOf(next),
        totalAmount: subtotalOf(next),
      };
    });
    // Serialize the server call (see runSerial). Re-check inside the queue: a
    // queued op (e.g. a reconcile tier-swap) may have already added a real
    // protection line — if so, drop our provisional line instead of double-adding.
    await runSerial(async () => {
      if (protectionLineOf(get().items, protectionVariants)) {
        set((s) => {
          const next = s.items.filter((i) => i.lineId !== provLineId);
          return {
            status: 'idle',
            error: null,
            items: next,
            totalQuantity: totalQuantityOf(next),
            subtotalAmount: subtotalOf(next),
            totalAmount: subtotalOf(next),
          };
        });
        return;
      }
      try {
        const cart = await addToCart({ merchandiseId: offeringMerchandiseId, quantity: 1 });
        set((s) => ({ ...applyCart(s, cart) }));
      } catch (e) {
        // Roll back the provisional protection line; recompute from what remains.
        set((s) => {
          const next = s.items.filter((i) => i.lineId !== provLineId);
          return {
            status: 'error',
            error: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
            items: next,
            totalQuantity: totalQuantityOf(next),
            subtotalAmount: subtotalOf(next),
            totalAmount: subtotalOf(next),
          };
        });
      }
    });
  },

  reconcileProtectionVariant: async () => {
    // Serialize against other mutations (see runSerial). The idle guard runs
    // INSIDE the queue so it sees the true post-prior-op status, not a stale
    // read taken before a concurrent applyCart flipped status to idle (the
    // duplicate-swap race that produced "merchandise line … does not exist").
    await runSerial(async () => {
      const { items, protectionVariants, protectionRate, status } = get();
      // Never swap while another mutation is in flight — the in-flight op will
      // reconcile and the next call picks up the post-op subtotal.
      if (status !== 'idle') return;
      // Feature disabled in Shopify — don't auto-swap tiers (the Hydrator
      // removes the protection line when enabled flips false).
      if (!get().protectionContent.enabled) return;
      const line = protectionLineOf(items, protectionVariants);
      if (!line) return; // protection off — nothing to reconcile
      const offering = computeProtectionOffering(items, protectionVariants, protectionRate);
      if (!offering) return;
      if (offering.merchandiseId === line.merchandiseId) return; // already the right tier

      set({ status: 'pending', error: null });
      try {
        const cart = await swapShippingProtection({
          oldLineId: line.lineId,
          newMerchandiseId: offering.merchandiseId,
        });
        set((s) => ({ ...applyCart(s, cart) }));
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : 'Something went wrong. Please try again.' });
        // swap is non-atomic (remove + add); on failure the cart may be left
        // without protection — re-hydrate so the toggle reflects the true state.
        try {
          const cart = await getCart();
          get().hydrateFromServer(cart);
        } catch {
          // keep error state
        }
      }
    });
  },

  autoDisableProtectionIfEmpty: async () => {
    const { items, protectionVariants, status } = get();
    // Don't race an in-flight mutation; don't act before the config is loaded.
    if (status !== 'idle') return;
    if (protectionVariants.length === 0) return;
    // Only act when there are NO merchandise lines but a protection line is
    // still present (an orphan — e.g. persisted from a prior session, or a
    // provisional protection line that resolved after the last product was
    // removed). The primary last-product removal is handled optimistically in
    // removeItem / setQuantity; this is the safety net for the edges.
    if (selectMerchandiseCount(items, protectionVariants) > 0) return;
    const line = protectionLineOf(items, protectionVariants);
    if (!line) return;
    await get().toggleShippingProtection(false);
  },
}));
