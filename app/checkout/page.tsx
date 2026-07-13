import Link from 'next/link';
import { getCart } from '@/app/cart/actions';
import { CheckoutExperience } from './CheckoutExperience';

// ---------------------------------------------------------------------------
// /checkout — the custom checkout page (Phase 4b).
//
// A Server Component shell that reads the Shopify cart once (server-side, so
// the order summary is stable and there is no hydration mismatch) and either:
//   - shows the dark empty-bag view (no cookie / expired cart / zero lines), or
//   - renders the <CheckoutExperience> client island, passing the cart as the
//     initial order-summary baseline.
//
// All interaction (contact form → shipping picker → continue-to-payment) lives
// in the client island, which calls the checkout server actions
// (app/checkout/actions.ts). The Zustand store is intentionally NOT hydrated
// on this route (LayoutWrapper excludes CartHydrator), so the cart is read
// here via getCart() — not via the store.
//
// LayoutWrapper hides Header/Footer/Drawer on /checkout (exact path match) and
// the page owns its full-screen dark layout. `force-dynamic`: the cart is
// per-buyer (cookie-bound) and must never be prerendered or cached at build
// time.
//
// Card entry is NEVER on our domain: "Continue to Payment" redirects to
// Shopify's hosted checkout (cart.checkoutUrl), which is prefilled with the
// contact/address/shipping collected here. PCI scope stays on Shopify.
// ---------------------------------------------------------------------------

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const cart = await getCart();

  // --- Empty bag (no cookie / expired / zero lines) ------------------------
  if (!cart || cart.lines.length === 0) {
    return (
      <div className="min-h-screen bg-primary-obsidian text-primary-cream flex flex-col items-center justify-center px-6 text-center">
        <Link href="/" className="mb-12">
          <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-primary-cream">Apeiron</h1>
        </Link>
        <h2 className="text-2xl font-bold uppercase tracking-wider mb-3">Your bag is empty</h2>
        <p className="text-ui-concrete text-sm mb-8 max-w-md">
          Nothing to check out yet. Explore the collection and add a piece to your bag.
        </p>
        <Link
          href="/collection"
          className="border border-ui-concrete px-8 py-3 text-sm uppercase tracking-widest font-bold text-primary-cream hover:bg-primary-cream hover:text-primary-obsidian transition-colors"
        >
          Explore the collection
        </Link>
      </div>
    );
  }

  // --- Custom checkout island (cart passed as the server-rendered baseline) -
  return <CheckoutExperience cart={cart} />;
}