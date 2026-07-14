import type { Metadata } from 'next';
import { CartView } from './CartView';

// ---------------------------------------------------------------------------
// /cart — the full-page shopping bag.
//
// A Server Component shell that renders the CartView client island. The cart
// itself is NOT fetched server-side here: CartView reads the shared Zustand
// store, which CartHydrator rehydrates from Shopify on mount. Keeping the
// fetch on the client (via CartHydrator) means the drawer, the page, and the
// badge all read one cache — they can never disagree.
//
// `force-dynamic`: the cart is per-buyer (cookie-bound) and must never be
// prerendered or cached at build time.
// `robots: noindex`: a transient cart page is not a canonical, linkable
// destination and must not appear in search indexes.
// ---------------------------------------------------------------------------

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <div className="min-h-screen bg-primary-obsidian text-primary-cream">
      <CartView />
    </div>
  );
}