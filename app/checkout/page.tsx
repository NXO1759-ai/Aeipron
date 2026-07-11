import Link from 'next/link';
import Image from 'next/image';
import { getCart } from '@/app/cart/actions';
import { formatCurrency } from '@/lib/utils';
import { CheckoutButton } from './CheckoutButton';

// ---------------------------------------------------------------------------
// Checkout page — a Server Component that reads the Shopify cart and either:
//   - shows the empty-bag view (no cookie / expired cart / zero lines), or
//   - renders an order summary sourced from Shopify and a Checkout button that
//     redirects to Shopify's hosted checkout URL (cart.checkoutUrl).
//
// No custom checkout form: Shopify's hosted checkout collects shipping +
// payment and computes the FINAL total (shipping + taxes). The figure shown
// here is the cart's `totalAmount`, which is an ESTIMATE
// (`totalAmountEstimated: true`) — it does NOT include shipping or final
// taxes. The UI labels it "Estimated total" and notes those are calculated at
// checkout, per SHOPIFY_API.md §6.
//
// Reading cookies() (via getCart) opts this route into dynamic rendering.
// ---------------------------------------------------------------------------

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const cart = await getCart();

  // --- Empty bag -----------------------------------------------------------
  if (!cart || cart.lines.length === 0) {
    return (
      <div className="min-h-screen bg-white text-primary-obsidian flex flex-col items-center justify-center px-6 text-center">
        <Link href="/" className="mb-12">
          <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-primary-obsidian">Aeipron</h1>
        </Link>
        <h2 className="text-2xl font-bold uppercase tracking-[0.2em] mb-6">Your bag is empty</h2>
        <Link
          href="/collection"
          className="border border-primary-obsidian px-10 py-4 uppercase tracking-widest font-bold text-sm hover:bg-primary-obsidian hover:text-white transition-colors"
        >
          Explore the collection
        </Link>
      </div>
    );
  }

  const estimatedTotal = formatCurrency(cart.totalAmount, cart.currencyCode);
  const subtotal = formatCurrency(cart.subtotalAmount, cart.currencyCode);
  const totalLabel = cart.totalAmountEstimated ? 'Estimated total' : 'Total';

  // --- Order summary + checkout redirect -----------------------------------
  return (
    <div className="min-h-screen bg-white text-primary-obsidian flex flex-col md:flex-row">
      {/* Left pane: heading + checkout action */}
      <div className="w-full md:w-1/2 lg:w-3/5 p-6 md:p-12 lg:p-24 flex flex-col justify-center">
        <div className="max-w-xl w-full mx-auto md:ml-auto md:mr-0 xl:mr-12">
          <Link href="/" className="inline-block mb-12">
            <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-primary-obsidian">Aeipron</h1>
          </Link>

          <h2 className="text-sm font-bold uppercase tracking-widest text-ui-concrete mb-4">
            Almost yours
          </h2>
          <p className="text-lg leading-relaxed mb-10 max-w-md">
            You&apos;ll complete your purchase on Shopify&apos;s secure checkout. Shipping and taxes are
            calculated there after you enter your address.
          </p>

          <CheckoutButton />

          <div className="mt-12 pt-8 border-t border-ui-concrete/20 flex gap-6 text-xs uppercase tracking-widest text-ui-concrete">
            <Link href="/collection" className="hover:text-primary-obsidian transition-colors">
              Continue shopping
            </Link>
          </div>
        </div>
      </div>

      {/* Right pane: order summary (sourced from Shopify) */}
      <div className="w-full md:w-1/2 lg:w-2/5 bg-ui-concrete/10 border-l border-ui-concrete/20 p-6 md:p-12 lg:p-24 flex flex-col">
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
                  <h4 className="uppercase font-bold text-sm tracking-wider leading-tight">{item.name}</h4>
                  <p className="text-ui-concrete text-xs uppercase tracking-widest mt-1">Size: {item.size}</p>
                </div>
                <div className="font-mono text-sm">
                  {formatCurrency(item.price * item.quantity, cart.currencyCode)}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-ui-concrete/30 pt-6 space-y-4 text-sm font-bold uppercase tracking-widest">
            <div className="flex justify-between text-ui-concrete">
              <span>Subtotal</span>
              <span className="font-mono">{subtotal}</span>
            </div>
            <div className="flex justify-between text-ui-concrete">
              <span>Shipping</span>
              <span className="font-mono">Calculated at checkout</span>
            </div>
          </div>

          <div className="border-t border-ui-concrete/30 mt-6 pt-6 flex justify-between items-center text-lg font-bold uppercase tracking-widest">
            <span>{totalLabel}</span>
            <span className="font-mono text-2xl">{estimatedTotal}</span>
          </div>

          <p className="mt-4 text-xs text-ui-concrete">
            {cart.totalAmountEstimated
              ? 'Taxes and shipping are calculated at checkout.'
              : 'Final total confirmed at checkout.'}
          </p>
        </div>
      </div>
    </div>
  );
}