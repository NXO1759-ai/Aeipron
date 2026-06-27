import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartItem {
  id: string;
  name: string;
  price: number; // DISPLAY ONLY. The server re-prices every line at checkout.
  size: string;
  quantity: number;
  image: string;
}

// Clamp until real inventory exists. Mirrored in the checkout server action.
export const MAX_QTY_PER_LINE = 10;

interface CartState {
  isOpen: boolean;
  items: CartItem[];
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  setQuantity: (id: string, size: string, quantity: number) => void;
  removeItem: (id: string, size: string) => void;
  clearCart: () => void;
}

// A cart line is unique per product + size, not product alone.
const lineKey = (id: string, size: string) => `${id}::${size}`;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      isOpen: false,
      items: [],
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),

      addItem: (item, qty = 1) =>
        set((state) => {
          const key = lineKey(item.id, item.size);
          const existing = state.items.find((i) => lineKey(i.id, i.size) === key);
          if (existing) {
            return {
              isOpen: true,
              items: state.items.map((i) =>
                lineKey(i.id, i.size) === key
                  ? { ...i, quantity: Math.min(i.quantity + qty, MAX_QTY_PER_LINE) }
                  : i
              ),
            };
          }
          return {
            isOpen: true,
            items: [...state.items, { ...item, quantity: Math.min(qty, MAX_QTY_PER_LINE) }],
          };
        }),

      setQuantity: (id, size, quantity) =>
        set((state) => {
          const clamped = Math.max(0, Math.min(Math.floor(quantity), MAX_QTY_PER_LINE));
          // Dropping to zero removes the line.
          if (clamped === 0) {
            return { items: state.items.filter((i) => lineKey(i.id, i.size) !== lineKey(id, size)) };
          }
          return {
            items: state.items.map((i) =>
              lineKey(i.id, i.size) === lineKey(id, size) ? { ...i, quantity: clamped } : i
            ),
          };
        }),

      removeItem: (id, size) =>
        set((state) => ({
          items: state.items.filter((i) => lineKey(i.id, i.size) !== lineKey(id, size)),
        })),

      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'aeipron-cart',
      storage: createJSONStorage(() => localStorage),
      // Persist the bag contents only — not the open/closed drawer state.
      partialize: (state) => ({ items: state.items }),
    }
  )
);
