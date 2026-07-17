import Link from 'next/link';
import Image from 'next/image';
import { getCart } from '@/app/cart/actions';
import { formatCurrency } from '@/lib/utils';
import { CheckoutButton } from './CheckoutButton';

// ---------------------------------------------------------------------------
// /checkout — a review + redirect page (DORMANT in the active flow).
//
// The active checkout flow no longer stops here: the cart drawer and the /cart
// page redirect DIRECTLY to Shopify's hosted checkout via the shared
// useCheckoutRedirect hook (cart → Shopify in one click, no intermediate
// page). This route is kept in the repo, reachable only by direct URL, so the
// custom two-phase checkout can be re-wired here later with no extra effort.
//
// When rendered (direct navigation), it is a Server Component shell that reads
// the Shopify cart once (server-side, so the order summary is stable and there
// is no hydration mismatch) and either:
//   - shows the dark empty-bag view (no cookie / expired cart / zero lines), or
//   - renders a dark two-pane review: left = heading + a <CheckoutButton> that
//     fetches `cart.checkoutUrl` and redirects the browser to Shopify's hosted
//     checkout (Shopify collects contact, shipping, and PAYMENT there); right =
//     a server-rendered order summary.
//
// Card entry is NEVER on our domain — Shopify's hosted checkout owns it (PCI
// scope stays on Shopify). We run no custom checkout form here.
//
// ─── Custom checkout (dormant) ───────────────────────────────────────────────
// The two-phase custom checkout — app/checkout/CheckoutExperience.tsx + its
// server actions in app/checkout/actions.ts (+ components/checkout/*,
// components/form/*, lib/checkout-schema.ts, lib/countries.ts, and their tests)
// — is KEPT in the repo but intentionally NOT rendered here. To re-enable it,
// replace the populated-cart branch below with:
//
//     import { CheckoutExperience } from './CheckoutExperience';
//     ...
//     return <CheckoutExperience cart={cart} />;
//
// Everything it depends on is preserved and still typechecked + unit-tested,
// so re-enabling is a one-line swap with no extra work.
// ─────────────────────────────────────────────────────────────────────────────
//
// LayoutWrapper hides Header/Footer/Drawer on /checkout (exact path match) and
// the page owns its full-screen dark layout. `force-dynamic`: the cart is
// per-buyer (cookie-bound) and must never be prerendered or cached at build
// time.
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

  // --- Redirect flow: review + CheckoutButton (→ Shopify hosted checkout) ---
  const currencyCode = cart.currencyCode;
  const subtotal = formatCurrency(cart.subtotalAmount, currencyCode);
  const estimatedTotal = formatCurrency(cart.totalAmount, currencyCode);
  const totalLabel = cart.totalAmountEstimated ? 'Estimated total' : 'Total';

  return (
    <div className="min-h-screen bg-primary-obsidian text-primary-cream flex flex-col md:flex-row">
      {/* Left pane: heading + CheckoutButton */}
      <div className="w-full md:w-1/2 lg:w-3/5 p-6 md:p-12 lg:p-24 flex flex-col justify-center">
        <div className="max-w-xl w-full mx-auto md:ml-auto md:mr-0 xl:mr-12">
          <Link href="/" className="inline-block mb-12">
            <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-primary-cream">
              Apeiron
            </h1>
          </Link>

          <h2 className="text-2xl font-bold uppercase tracking-wider mb-3">Checkout</h2>
          <p className="text-ui-concrete text-sm mb-10 max-w-md">
            Review your bag, then continue to Shopify&rsquo;s secure checkout to enter your
            shipping and payment details.
          </p>

          <CheckoutButton />

          <div className="pt-4 text-xs uppercase tracking-widest text-ui-concrete">
            <Link href="/cart" className="hover:text-primary-cream transition-colors">
              Back to bag
            </Link>
          </div>
        </div>
      </div>

      {/* Right pane: order summary (server-rendered, stable) */}
      <div className="w-full md:w-1/2 lg:w-2/5 bg-apeiron-black border-l border-ui-concrete/20 p-6 md:p-12 lg:p-24 flex flex-col">
        <div className="max-w-md w-full mx-auto md:mr-auto md:ml-0 xl:ml-12">
          <h2 className="text-lg font-bold uppercase tracking-widest mb-8">Order summary</h2>

          <div className="space-y-6 mb-8 max-h-[50vh] overflow-y-auto hide-scrollbar">
            {cart.lines.map((item) => (
              <div key={item.lineId} className="flex gap-4 items-center">
                <div className="relative w-16 h-20 bg-ui-concrete/20 flex-shrink-0">
                  {item.image ? (
                    <Image src={item.image} alt={item.name} fill className="object-cover" />
                  ) : null}
                  <span className="absolute -top-2 -right-2 bg-primary-obsidian text-primary-cream w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">
                    {item.quantity}
                  </span>
                </div>
                <div className="flex-1">
                  <h4 className="uppercase font-bold text-sm tracking-wider leading-tight text-primary-cream">
                    {item.name}
                  </h4>
                  <p className="text-ui-concrete text-xs uppercase tracking-widest mt-1">
                    Variant: {item.variantLabel}
                  </p>
                </div>
                <div className="font-mono text-sm text-primary-cream">
                  {formatCurrency(item.price * item.quantity, currencyCode)}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-ui-concrete/30 pt-6 space-y-4 text-sm font-bold uppercase tracking-widest">
            <div className="flex justify-between text-ui-concrete">
              <span>Subtotal</span>
              <span className="font-mono text-primary-cream">{subtotal}</span>
            </div>
            <div className="flex justify-between text-ui-concrete">
              <span>Shipping</span>
              <span className="font-mono text-primary-cream">Calculated at checkout</span>
            </div>
          </div>

          <div className="border-t border-ui-concrete/30 mt-6 pt-6 flex justify-between items-center text-lg font-bold uppercase tracking-widest">
            <span className="text-primary-cream">{totalLabel}</span>
            <span className="font-mono text-2xl text-primary-cream">{estimatedTotal}</span>
          </div>

          <p className="mt-4 text-xs text-ui-concrete">
            {cart.totalAmountEstimated
              ? 'Taxes and shipping are calculated at Shopify checkout.'
              : 'Final total confirmed at checkout.'}
          </p>
        </div>
      </div>
    </div>
  );
}
