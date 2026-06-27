'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useCart } from '@/store/use-cart';
import { useHydrated } from '@/hooks/use-hydrated';
import { createCheckout, type CheckoutResult } from './actions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const hydrated = useHydrated();

  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', address: '', city: '', postal: '',
  });
  const [status, setStatus] = useState<'idle' | 'processing' | 'placed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);

  const lines = hydrated ? items : [];
  // Client-side subtotal is for DISPLAY ONLY. The figure that matters is the
  // one the server returns from createCheckout.
  const subtotalDisplay = lines.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const shippingDisplay = subtotalDisplay >= 200 ? 0 : 15;
  const totalDisplay = subtotalDisplay + shippingDisplay;

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // express = wallet flow, which legitimately skips the shipping form.
  const placeOrder = async (express = false) => {
    setError(null);

    if (lines.length === 0) {
      setError('Your bag is empty.');
      return;
    }
    if (!express) {
      if (!EMAIL_RE.test(form.email)) return setError('Enter a valid email address.');
      if (!form.firstName.trim() || !form.lastName.trim()) return setError('Enter your name.');
      if (!form.address.trim() || !form.city.trim() || !form.postal.trim()) {
        return setError('Complete your shipping address.');
      }
    }

    setStatus('processing');
    // Send only id/size/quantity. No price crosses the wire.
    const result = await createCheckout(
      lines.map((i) => ({ id: i.id, size: i.size, quantity: i.quantity }))
    );

    if (!result.ok) {
      setStatus('idle');
      setError(result.error ?? 'Something went wrong. Please try again.');
      return;
    }

    setReceipt(result);
    setStatus('placed');
    clearCart();
  };

  // --- Order confirmation -----------------------------------------------------
  if (status === 'placed' && receipt) {
    return (
      <div className="min-h-screen bg-white text-primary-obsidian flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-3xl font-bold uppercase tracking-[0.2em] mb-6">Order placed</h1>
        <p className="text-ui-concrete max-w-md mb-2 uppercase tracking-widest text-sm">
          Server-verified total
        </p>
        <p className="font-mono text-4xl mb-8">${receipt.amount?.toFixed(2)}</p>
        <p className="text-ui-concrete text-xs max-w-sm mb-10">
          Demo checkout — no payment was taken. The total above was recomputed from the
          catalog on the server, not from the browser.
        </p>
        <Link href="/collection" className="border border-primary-obsidian px-10 py-4 uppercase tracking-widest font-bold text-sm hover:bg-primary-obsidian hover:text-white transition-colors">
          Continue shopping
        </Link>
      </div>
    );
  }

  // --- Empty bag --------------------------------------------------------------
  if (hydrated && lines.length === 0) {
    return (
      <div className="min-h-screen bg-white text-primary-obsidian flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-3xl font-bold uppercase tracking-[0.2em] mb-6">Your bag is empty</h1>
        <Link href="/collection" className="border border-primary-obsidian px-10 py-4 uppercase tracking-widest font-bold text-sm hover:bg-primary-obsidian hover:text-white transition-colors">
          Explore the collection
        </Link>
      </div>
    );
  }

  const processing = status === 'processing';

  return (
    <div className="min-h-screen bg-white text-primary-obsidian flex flex-col md:flex-row">

      {/* Left Pane: Data Input */}
      <div className="w-full md:w-1/2 lg:w-3/5 p-6 md:p-12 lg:p-24 flex flex-col">
        <div className="max-w-xl w-full mx-auto md:ml-auto md:mr-0 xl:mr-12">
          <Link href="/" className="inline-block mb-12">
            <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-primary-obsidian">Aeipron</h1>
          </Link>

          {/* Express Checkout */}
          <div className="mb-12">
            <h2 className="text-sm font-bold uppercase tracking-widest text-center mb-4 text-ui-concrete">Express Checkout</h2>
            <div className="flex gap-4">
              <button type="button" onClick={() => placeOrder(true)} disabled={processing} className="flex-1 bg-black text-white py-4 rounded-md flex justify-center items-center font-bold tracking-widest transition-transform active:scale-95 disabled:opacity-50">
                Apple Pay
              </button>
              <button type="button" onClick={() => placeOrder(true)} disabled={processing} className="flex-1 bg-[#4285F4] text-white py-4 rounded-md flex justify-center items-center font-bold tracking-widest transition-transform active:scale-95 disabled:opacity-50">
                Google Pay
              </button>
            </div>

            <div className="flex items-center my-8">
              <div className="flex-1 border-t border-ui-concrete/30" />
              <span className="px-4 text-ui-concrete uppercase tracking-widest text-xs font-bold">Or continue manually</span>
              <div className="flex-1 border-t border-ui-concrete/30" />
            </div>
          </div>

          {/* Standard Form */}
          <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); placeOrder(false); }}>
            <div>
              <h3 className="text-lg font-bold uppercase tracking-widest mb-4">Contact</h3>
              <label htmlFor="email" className="sr-only">Email address</label>
              <input id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} placeholder="Email Address" className="w-full border border-ui-concrete/50 p-4 rounded-sm focus:outline-none focus:border-primary-obsidian transition-colors" />
            </div>

            <div>
              <h3 className="text-lg font-bold uppercase tracking-widest mb-4">Shipping</h3>
              <div className="grid grid-cols-2 gap-4">
                <label htmlFor="firstName" className="sr-only">First name</label>
                <input id="firstName" type="text" autoComplete="given-name" value={form.firstName} onChange={update('firstName')} placeholder="First Name" className="w-full border border-ui-concrete/50 p-4 rounded-sm focus:outline-none focus:border-primary-obsidian transition-colors" />
                <label htmlFor="lastName" className="sr-only">Last name</label>
                <input id="lastName" type="text" autoComplete="family-name" value={form.lastName} onChange={update('lastName')} placeholder="Last Name" className="w-full border border-ui-concrete/50 p-4 rounded-sm focus:outline-none focus:border-primary-obsidian transition-colors" />
                <label htmlFor="address" className="sr-only">Address</label>
                <input id="address" type="text" autoComplete="street-address" value={form.address} onChange={update('address')} placeholder="Address" className="w-full border border-ui-concrete/50 p-4 rounded-sm focus:outline-none focus:border-primary-obsidian transition-colors col-span-2" />
                <label htmlFor="city" className="sr-only">City</label>
                <input id="city" type="text" autoComplete="address-level2" value={form.city} onChange={update('city')} placeholder="City" className="w-full border border-ui-concrete/50 p-4 rounded-sm focus:outline-none focus:border-primary-obsidian transition-colors" />
                <label htmlFor="postal" className="sr-only">Postal code</label>
                <input id="postal" type="text" autoComplete="postal-code" value={form.postal} onChange={update('postal')} placeholder="Postal Code" className="w-full border border-ui-concrete/50 p-4 rounded-sm focus:outline-none focus:border-primary-obsidian transition-colors" />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-accent-energy text-sm uppercase tracking-widest font-bold">{error}</p>
            )}

            <button type="submit" disabled={processing} className="w-full bg-accent-energy text-primary-cream py-6 uppercase tracking-widest font-bold mt-8 hover:bg-accent-energy/90 transition-colors disabled:opacity-60">
              {processing ? 'Processing…' : 'Pay now'}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-ui-concrete/20 flex gap-6 text-xs uppercase tracking-widest text-ui-concrete">
            <Link href="#" className="hover:text-primary-obsidian transition-colors">Refund Policy</Link>
            <Link href="#" className="hover:text-primary-obsidian transition-colors">Shipping Policy</Link>
          </div>
        </div>
      </div>

      {/* Right Pane: Order Summary */}
      <div className="w-full md:w-1/2 lg:w-2/5 bg-ui-concrete/10 border-l border-ui-concrete/20 p-6 md:p-12 lg:p-24 flex flex-col">
        <div className="max-w-md w-full mx-auto md:mr-auto md:ml-0 xl:ml-12">

          <div className="space-y-6 mb-8 max-h-[50vh] overflow-y-auto hide-scrollbar">
            {lines.map((item) => (
              <div key={`${item.id}-${item.size}`} className="flex gap-4 items-center">
                <div className="relative w-16 h-20 bg-ui-concrete/20 flex-shrink-0">
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                  <span className="absolute -top-2 -right-2 bg-primary-obsidian text-primary-cream w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">
                    {item.quantity}
                  </span>
                </div>
                <div className="flex-1">
                  <h4 className="uppercase font-bold text-sm tracking-wider leading-tight">{item.name}</h4>
                  <p className="text-ui-concrete text-xs uppercase tracking-widest mt-1">Size: {item.size}</p>
                </div>
                <div className="font-mono text-sm">${(item.price * item.quantity).toFixed(2)}</div>
              </div>
            ))}
          </div>

          <div className="border-t border-ui-concrete/30 pt-6 space-y-4 text-sm font-bold uppercase tracking-widest">
            <div className="flex justify-between text-ui-concrete">
              <span>Subtotal</span>
              <span className="font-mono">${subtotalDisplay.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-ui-concrete">
              <span>Shipping</span>
              <span className="font-mono">{shippingDisplay === 0 ? 'Complimentary' : `$${shippingDisplay.toFixed(2)}`}</span>
            </div>
          </div>

          <div className="border-t border-ui-concrete/30 mt-6 pt-6 flex justify-between items-center text-lg font-bold uppercase tracking-widest">
            <span>Total</span>
            <span className="font-mono text-2xl">${totalDisplay.toFixed(2)}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
