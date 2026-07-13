'use client';

import { useCart } from '@/store/use-cart';
import { useHydrated } from '@/hooks/use-hydrated';
import { formatCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { CartLineItem } from '@/components/CartLineItem';

export function CartDrawer() {
  const {
    isOpen,
    closeCart,
    items,
    totalQuantity,
    subtotalAmount,
    currencyCode,
    status,
    error,
    setQuantity,
    removeItem,
  } = useCart();
  const hydrated = useHydrated();

  // Before hydration, render the empty/zero baseline so SSR and client agree.
  const count = hydrated ? totalQuantity : 0;
  const lines = hydrated ? items : [];
  const subtotal = hydrated ? formatCurrency(subtotalAmount, currencyCode) : formatCurrency(0, currencyCode);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col bg-primary-obsidian border-l border-ui-concrete/20"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping bag"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-ui-concrete/20">
              <h2 className="text-xl font-bold uppercase tracking-wider text-primary-cream">
                Bag ({count})
              </h2>
              <button
                onClick={closeCart}
                aria-label="Close bag"
                className="text-ui-concrete hover:text-primary-cream transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-ui-concrete">
                  <p className="mb-4">Your bag is empty.</p>
                  <button
                    onClick={closeCart}
                    className="border border-ui-concrete px-6 py-2 text-sm uppercase tracking-widest hover:border-primary-cream hover:text-primary-cream transition-colors"
                  >
                    Continue shopping
                  </button>
                </div>
              ) : (
                lines.map((item) => (
                  <CartLineItem
                    key={item.lineId}
                    item={item}
                    currencyCode={currencyCode}
                    onSetQuantity={setQuantity}
                    onRemove={removeItem}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            {lines.length > 0 && (
              <div className="border-t border-ui-concrete/20 p-6 bg-primary-obsidian">
                {error && (
                  <p role="alert" className="mb-4 text-accent-energy text-xs uppercase tracking-widest font-bold">
                    {error}
                  </p>
                )}
                <div className="flex justify-between items-center mb-6 text-primary-cream font-bold tracking-wider uppercase">
                  <span>Subtotal</span>
                  <span className="font-mono">{subtotal}</span>
                </div>
                <Link
                  href="/checkout"
                  onClick={closeCart}
                  className="block w-full bg-primary-cream text-primary-obsidian py-4 text-center uppercase tracking-widest font-bold hover:bg-white transition-colors"
                >
                  Proceed to checkout
                </Link>
                <Link
                  href="/cart"
                  onClick={closeCart}
                  className="block w-full mt-3 py-3 text-center uppercase tracking-widest text-xs font-bold text-ui-concrete hover:text-primary-cream border border-ui-concrete/30 hover:border-primary-cream transition-colors"
                >
                  View full bag
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}