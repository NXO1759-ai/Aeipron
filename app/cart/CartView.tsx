'use client';

import Link from 'next/link';
import { useCart, isProtectionLine, selectMerchandiseCount } from '@/store/use-cart';
import { useHydrated } from '@/hooks/use-hydrated';
import { formatCurrency } from '@/lib/utils';
import { CartLineItem } from '@/components/CartLineItem';
import { ShippingProtectionToggle } from '@/components/ShippingProtectionToggle';
import { useCheckoutRedirect } from '@/hooks/use-checkout-redirect';

// ---------------------------------------------------------------------------
// CartView — the client island for the /cart page.
//
// Reads the SAME Zustand store the CartDrawer reads (one cart, one source of
// truth), so the drawer and the full page can never disagree. Gated behind
// `useHydrated()` exactly like the drawer: pre-hydration renders a zero-state
// baseline so SSR HTML and the first client paint match (no hydration
// mismatch), then the live cart — rehydrated from Shopify by CartHydrator —
// renders on the next tick.
//
// Empty state points shoppers back to the collection so /cart is never a dead
// end. Populated state reuses CartLineItem (shared with the drawer) for the
// line rows, shows the merchandise subtotal, and hands off DIRECTLY to
// Shopify's hosted checkout via the shared useCheckoutRedirect hook (no
// intermediate /checkout page). The "Estimated total" wording reflects that
// shipping and tax are computed at Shopify's checkout after the buyer enters
// an address, never on this page.
// ---------------------------------------------------------------------------

export function CartView() {
  const {
    items,
    subtotalAmount,
    totalAmount,
    totalAmountEstimated,
    currencyCode,
    status,
    error,
    protectionVariants,
    setQuantity,
    removeItem,
  } = useCart();
  const hydrated = useHydrated();
  const { status: checkoutStatus, redirect: redirectToCheckout, reset: resetCheckout } =
    useCheckoutRedirect();

  // Pre-hydration baseline: render zero so SSR and the first client paint
  // agree. Once hydrated, the store reflects the Shopify cart (rehydrated by
  // CartHydrator on mount).
  const allLines = hydrated ? items : [];
  // The protection line is represented by the toggle, NOT a cart row — filter
  // it out. The bag count counts merchandise only.
  const lines = allLines.filter((i) => !isProtectionLine(i, protectionVariants));
  const count = hydrated ? selectMerchandiseCount(allLines, protectionVariants) : 0;
  const subtotal = hydrated ? formatCurrency(subtotalAmount, currencyCode) : formatCurrency(0, currencyCode);
  const total = hydrated ? formatCurrency(totalAmount, currencyCode) : formatCurrency(0, currencyCode);

  // Empty state — only trust it once hydrated (SSR / pre-hydration always has
  // a zero baseline, which is NOT "your bag is empty"; it just isn't loaded).
  // Base on ALL lines (incl. protection) so a lone protection line still shows
  // the order summary + toggle (to turn it off) rather than the empty state.
  const isEmpty = hydrated && allLines.length === 0;

  if (isEmpty) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-6">
        <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-wider text-primary-cream mb-3">
          Your bag is empty
        </h2>
        <p className="text-ui-concrete text-sm mb-8 max-w-md">
          Nothing in here yet. Explore the shop and add a piece to your bag.
        </p>
        <Link
          href="/shop"
          className="border border-ui-concrete px-8 py-3 text-sm uppercase tracking-widest font-bold text-primary-cream hover:bg-primary-cream hover:text-primary-obsidian transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-12 md:py-20">
      <header className="mb-10 md:mb-14">
        <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tighter text-primary-cream">
          Bag ({count})
        </h1>
        <p className="mt-2 text-ui-concrete text-sm">
          Review your selections. Shipping and tax are calculated at checkout.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-10 lg:gap-16">
        {/* Line items */}
        <div className="space-y-8">
          {lines.map((item) => (
            <CartLineItem
              key={item.lineId}
              item={item}
              currencyCode={currencyCode}
              onSetQuantity={setQuantity}
              onRemove={removeItem}
            />
          ))}
        </div>

        {/* Order summary */}
        <aside className="lg:sticky lg:top-28 h-fit border border-ui-concrete/20 bg-primary-obsidian p-6 md:p-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-primary-cream mb-6">
            Order summary
          </h2>

          <ShippingProtectionToggle />

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between text-ui-concrete">
              <dt>Subtotal</dt>
              <dd className="font-mono text-primary-cream">{subtotal}</dd>
            </div>
            <div className="flex justify-between text-ui-concrete">
              <dt>Shipping</dt>
              <dd className="uppercase tracking-widest text-xs self-center">Calculated at checkout</dd>
            </div>
            <div className="flex justify-between pt-4 border-t border-ui-concrete/20">
              <dt className="uppercase tracking-widest font-bold text-primary-cream">
                {totalAmountEstimated ? 'Estimated total' : 'Total'}
              </dt>
              <dd className="font-mono font-bold text-primary-cream">{total}</dd>
            </div>
          </dl>

          {status === 'error' && error ? (
            <p role="alert" className="mt-4 text-accent-energy text-xs uppercase tracking-widest font-bold">
              {error}
            </p>
          ) : null}

          {checkoutStatus === 'error' ? (
            <div className="mt-6 w-full">
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
              className="mt-6 block w-full bg-primary-cream text-primary-obsidian py-4 text-center uppercase tracking-widest font-bold hover:bg-white transition-colors disabled:opacity-60"
            >
              {checkoutStatus === 'redirecting' ? 'Redirecting to checkout…' : 'Proceed to checkout'}
            </button>
          )}

          <Link
            href="/shop"
            className="mt-3 block w-full py-3 text-center uppercase tracking-widest text-xs font-bold text-ui-concrete hover:text-primary-cream transition-colors"
          >
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}