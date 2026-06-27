'use client';

import { useCart } from '@/store/use-cart';
import { useHydrated } from '@/hooks/use-hydrated';
import { motion, AnimatePresence } from 'motion/react';
import { X, Minus, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export function CartDrawer() {
  const { isOpen, closeCart, items, setQuantity, removeItem } = useCart();
  const hydrated = useHydrated();

  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  // Before hydration, render the empty/zero baseline so SSR and client agree.
  const count = hydrated ? items.length : 0;
  const lines = hydrated ? items : [];

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
              <h2 className="text-xl font-bold uppercase tracking-wider text-primary-cream">Bag ({count})</h2>
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
                  <div key={`${item.id}-${item.size}`} className="flex gap-4">
                    <div className="relative h-24 w-20 flex-shrink-0 bg-primary-cream overflow-hidden">
                      <Image src={item.image} alt={item.name} fill className="object-cover" />
                    </div>
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <div className="flex justify-between">
                          <h3 className="text-primary-cream uppercase tracking-wider font-bold text-sm">{item.name}</h3>
                          <p className="text-primary-cream font-mono">${item.price}</p>
                        </div>
                        <p className="text-ui-concrete text-sm mt-1">Size: {item.size}</p>
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        {/* Quantity stepper */}
                        <div className="flex items-center gap-3 border border-ui-concrete/30 px-2 py-1">
                          <button
                            onClick={() => setQuantity(item.id, item.size, item.quantity - 1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="text-ui-concrete hover:text-primary-cream transition-colors"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="text-primary-cream text-sm w-5 text-center tabular-nums" aria-live="polite">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => setQuantity(item.id, item.size, item.quantity + 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="text-ui-concrete hover:text-primary-cream transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.id, item.size)}
                          aria-label={`Remove ${item.name} from bag`}
                          className="flex items-center gap-1 text-ui-concrete hover:text-accent-energy transition-colors text-xs uppercase tracking-widest"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {lines.length > 0 && (
              <div className="border-t border-ui-concrete/20 p-6 bg-primary-obsidian">
                <div className="flex justify-between items-center mb-6 text-primary-cream font-bold tracking-wider uppercase">
                  <span>Subtotal</span>
                  <span className="font-mono">${subtotal.toFixed(2)}</span>
                </div>
                <Link
                  href="/checkout"
                  onClick={closeCart}
                  className="block w-full bg-primary-cream text-primary-obsidian py-4 text-center uppercase tracking-widest font-bold hover:bg-white transition-colors"
                >
                  Proceed to checkout
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
