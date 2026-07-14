'use client';

import { useCheckoutRedirect } from '@/hooks/use-checkout-redirect';

// ---------------------------------------------------------------------------
// CheckoutButton — the interactive piece of the (otherwise server-rendered)
// /checkout page. Delegates to the shared useCheckoutRedirect hook so its
// idle/redirecting/error behavior stays identical to the cart drawer's and the
// /cart page's "Proceed to checkout" buttons.
//
// NOTE: the active checkout flow no longer routes through /checkout — the cart
// drawer and the /cart page redirect DIRECTLY to Shopify's hosted checkout via
// the same hook. This page (and this button) are kept dormant, reachable only
// by direct URL, so the custom-checkout code (CheckoutExperience.tsx + its
// actions) can be re-wired here later with no extra effort. To re-enable the
// intermediate review page as a flow step, link "Proceed to checkout" back to
// /checkout in CartDrawer.tsx / CartView.tsx.
// ---------------------------------------------------------------------------

export function CheckoutButton() {
  const { status, redirect, reset } = useCheckoutRedirect();

  if (status === 'error') {
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={reset}
          className="w-full border border-ui-concrete text-primary-cream py-5 uppercase tracking-widest font-bold text-sm hover:bg-primary-cream hover:text-primary-obsidian transition-colors"
        >
          Try again
        </button>
        <p role="alert" className="mt-3 text-xs uppercase tracking-widest text-ui-concrete text-center">
          Your bag may have changed — please refresh the page.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={redirect}
      disabled={status === 'redirecting'}
      className="w-full bg-accent-energy text-primary-cream py-6 uppercase tracking-widest font-bold hover:bg-accent-energy/90 transition-colors disabled:opacity-60"
    >
      {status === 'redirecting' ? 'Redirecting to checkout…' : 'Checkout'}
    </button>
  );
}