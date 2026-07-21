'use client';

import { useCart } from '@/store/use-cart';
import { useHydrated } from '@/hooks/use-hydrated';
import { formatCurrency } from '@/lib/utils';
import { X } from 'lucide-react';
import Link from 'next/link';
import { CartLineItem } from '@/components/CartLineItem';
import { ShippingProtection } from '@/components/cart/ShippingProtection';
import { useCheckoutRedirect } from '@/hooks/use-checkout-redirect';

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
  const { status: checkoutStatus, redirect: redirectToCheckout, reset: resetCheckout } =
    useCheckoutRedirect();

  // Before hydration, render the empty/zero baseline so SSR and client agree.
  const count = hydrated ? totalQuantity : 0;
  const lines = hydrated ? items : [];
  const subtotal = hydrated ? formatCurrency(subtotalAmount, currencyCode) : formatCurrency(0, currencyCode);

  // The drawer + backdrop stay mounted and slide/fade with CSS transitions —
  // transform and opacity run on the compositor, so the pull-out stays smooth
  // even when the main thread is busy. `inert` keeps the closed drawer out of
  // the tab order and the accessibility tree.
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeCart}
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/70 transition-opacity duration-300 ease-out ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        inert={!isOpen}
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col bg-primary-obsidian border-l border-ui-concrete/20 will-change-transform transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
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
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
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

        {/* Shipping protection (Navidium) — only when the bag has lines */}
        {lines.length > 0 && <ShippingProtection />}

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

            {checkoutStatus === 'error' ? (
              <div className="w-full">
                <button
                  type="button"
                  onClick={resetCheckout}
                  className="block w-full border border-ui-concrete text-primary-cream py-4 text-center uppercase tracking-widest font-bold text-sm hover:bg-primary-cream hover:text-primary-obsidian transition-colors"
                >
                  Try again
                </button>
                <p
                  role="alert"
                  className="mt-3 text-xs uppercase tracking-widest text-ui-concrete text-center"
                >
                  Your bag may have changed — please refresh the page.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={redirectToCheckout}
                disabled={checkoutStatus === 'redirecting'}
                className="block w-full bg-primary-cream text-primary-obsidian py-4 text-center uppercase tracking-widest font-bold hover:bg-white transition-colors disabled:opacity-60"
              >
                {checkoutStatus === 'redirecting' ? 'Redirecting to checkout…' : 'Proceed to checkout'}
              </button>
            )}

            <Link
              href="/cart"
              onClick={closeCart}
              className="block w-full mt-3 py-3 text-center uppercase tracking-widest text-xs font-bold text-ui-concrete hover:text-primary-cream border border-ui-concrete/30 hover:border-primary-cream transition-colors"
            >
              View full bag
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
