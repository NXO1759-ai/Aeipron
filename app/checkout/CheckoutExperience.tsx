'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  checkoutContactSchema,
  type CheckoutContact,
  COUNTRIES,
} from '@/lib/checkout-schema';
import { addressRulesFor } from '@/lib/countries';
import {
  updateCheckoutContact,
  selectDeliveryOption,
  getCheckoutDetails,
} from '@/app/checkout/actions';
import { getCheckoutUrl } from '@/app/cart/actions';
import type { Cart, CheckoutDetails } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { Field, Input, Select } from '@/components/form/Field';
import { DeliveryOptions } from '@/components/checkout/DeliveryOptions';

// ---------------------------------------------------------------------------
// CheckoutExperience — the custom-checkout client island.
//
// Two-phase wizard on the single /checkout route (dark theme):
//   Phase 1 — Information: a react-hook-form + zod form (name, email, phone,
//             address, city, country, zip). On submit → the
//             `updateCheckoutContact` server action sets the buyer identity +
//             selected delivery address (triggers rate calc) and returns
//             CheckoutDetails (cart + deliveryGroups with shipping options).
//   Phase 2 — Shipping:    the delivery options render as a radio list. Picking
//             one → `selectDeliveryOption` persists it; the order summary's
//             estimated total then includes shipping. "Continue to Payment"
//             → `getCheckoutUrl` (re-fetched fresh) → redirect to Shopify's
//             hosted checkout, which is PREFILLED with the contact/address/
//             shipping and handles CARD ENTRY (PCI scope stays on Shopify).
//
// TRUST BOUNDARY: this component imports ONLY server actions + pure domain
// modules (lib/types, lib/countries, lib/checkout-schema, lib/utils). It never
// imports lib/shopify/* or lib/cart-cookie (server-only). The server actions
// re-validate every payload — the client never sends a price; it sends only
// contact fields, countryCode, address fields, and the two opaque delivery
// handles. The Zustand store is intentionally not hydrated on /checkout, so
// this island reads everything via the server actions (not the store).
//
// The initial `cart` prop is server-rendered (stable, no hydration mismatch);
// once a mutation returns, the order summary follows the latest
// `CheckoutDetails.cart` (Shopify is the source of truth).
// ---------------------------------------------------------------------------

type Phase = 'information' | 'shipping';

interface CheckoutExperienceProps {
  /** The server-rendered cart (the empty-state guard already passed). */
  cart: Cart;
}

const CONTACT_ERROR = 'We could not complete this step. Please try again.';
const BAG_CHANGED_ERROR = 'Your bag may have changed — please refresh the page.';

export function CheckoutExperience({ cart }: CheckoutExperienceProps) {
  const [phase, setPhase] = useState<Phase>('information');
  const [details, setDetails] = useState<CheckoutDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rehydrating, setRehydrating] = useState(true);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CheckoutContact>({
    resolver: zodResolver(checkoutContactSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address1: '',
      address2: '',
      city: '',
      zip: '',
      country: '',
    },
  });

  // useWatch (not watch()) — the react-hooks lint plugin flags watch() as not
  // safely memoizable. useWatch subscribes to the field and re-renders on change
  // so the zip label follows the selected country.
  const country = useWatch({ control, name: 'country' }) || '';
  const rules = addressRulesFor(country);

  // --- Rehydrate: if the buyer returns to /checkout with an address + shipping
  //     option already on the cart, jump straight to the shipping phase. The
  //     plain cart prop has no deliveryGroups, so this reads them via the
  //     checkout action. Runs once on mount. All setState here is AFTER an await
  //     (asynchronous), so it does not trigger the set-state-in-effect rule.
  //     If exactly one option exists and none is selected, auto-select it here
  //     (same convenience as the fresh-submit path below). --------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getCheckoutDetails();
        if (cancelled || !res) return;
        const grp = res.deliveryGroups[0];
        // Only skip the form when shipping options already exist (address set).
        if (!grp || grp.deliveryOptions.length === 0) return;
        setDetails(res);
        setPhase('shipping');
        // Auto-select the sole option if none is selected yet.
        if (grp.deliveryOptions.length === 1 && !grp.selectedHandle) {
          const sel = await selectDeliveryOption({
            deliveryGroupId: grp.id,
            deliveryOptionHandle: grp.deliveryOptions[0].handle,
          });
          if (!cancelled && sel) setDetails(sel);
        }
      } catch {
        // Non-fatal: stay on the information phase (fresh form).
      } finally {
        if (!cancelled) setRehydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Phase 1 submit: set contact + address → receive shipping options. ----
  // If the address yields exactly one shipping option, auto-select it here so
  // the buyer is never blocked on a no-op choice. (Done in the handler — not an
  // effect — to keep state updates out of the render phase.)
  const onSubmit = async (data: CheckoutContact) => {
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await updateCheckoutContact(data);
      if (!res) {
        setActionError(BAG_CHANGED_ERROR);
        return;
      }
      const grp = res.deliveryGroups[0];
      if (grp && grp.deliveryOptions.length === 1 && !grp.selectedHandle) {
        const sel = await selectDeliveryOption({
          deliveryGroupId: grp.id,
          deliveryOptionHandle: grp.deliveryOptions[0].handle,
        });
        if (sel) {
          setDetails(sel);
          setPhase('shipping');
          return;
        }
      }
      setDetails(res);
      setPhase('shipping');
    } catch {
      setActionError(CONTACT_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Phase 2: pick a shipping option → persist + refresh totals. ----------
  const group = details?.deliveryGroups[0] ?? null;
  const options = group?.deliveryOptions ?? [];
  const selectedHandle = group?.selectedHandle ?? null;
  const selectedOption =
    options.find((o) => o.handle === selectedHandle) ?? null;

  const onSelectOption = async (handle: string) => {
    if (!group) return;
    setSelecting(true);
    setActionError(null);
    try {
      const res = await selectDeliveryOption({
        deliveryGroupId: group.id,
        deliveryOptionHandle: handle,
      });
      if (!res) {
        setActionError(BAG_CHANGED_ERROR);
        return;
      }
      setDetails(res);
    } catch {
      setActionError(CONTACT_ERROR);
    } finally {
      setSelecting(false);
    }
  };

  // --- Continue to Payment: re-fetch the checkout URL fresh, then redirect. -
  const onContinue = async () => {
    setRedirecting(true);
    setActionError(null);
    try {
      const url = await getCheckoutUrl();
      if (url) {
        // Full navigation to Shopify's hosted checkout (prefilled with the
        // contact/address/shipping; card entry happens there). The SPA stays
        // out of the payment flow entirely.
        window.location.href = url;
        return;
      }
      setActionError(BAG_CHANGED_ERROR);
      setRedirecting(false);
    } catch {
      setActionError(CONTACT_ERROR);
      setRedirecting(false);
    }
  };

  // The order summary follows the latest cart (post-mutation) when available,
  // else the server-rendered prop. Shopify is the source of truth.
  const displayCart = details?.cart ?? cart;
  const currencyCode = displayCart.currencyCode;
  const estimatedTotal = formatCurrency(displayCart.totalAmount, currencyCode);
  const subtotal = formatCurrency(displayCart.subtotalAmount, currencyCode);
  const totalLabel = displayCart.totalAmountEstimated ? 'Estimated total' : 'Total';
  const countryName = COUNTRIES.find((c) => c.code === country)?.name;
  const canContinue = Boolean(selectedHandle) && !selecting && !redirecting;

  return (
    <div className="min-h-screen bg-primary-obsidian text-primary-cream flex flex-col md:flex-row">
      {/* Left pane: the form / shipping picker + continue action */}
      <div className="w-full md:w-1/2 lg:w-3/5 p-6 md:p-12 lg:p-24 flex flex-col justify-center">
        <div className="max-w-xl w-full mx-auto md:ml-auto md:mr-0 xl:mr-12">
          <Link href="/" className="inline-block mb-12">
            <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-primary-cream">
              Apeiron
            </h1>
          </Link>

          {/* Step indicator */}
          <ol className="mb-8 flex gap-2 text-xs uppercase tracking-widest">
            <li className={phase === 'information' ? 'text-primary-cream font-bold' : 'text-ui-concrete'}>
              1. Information
            </li>
            <li className="text-ui-concrete" aria-hidden="true">/</li>
            <li className={phase === 'shipping' ? 'text-primary-cream font-bold' : 'text-ui-concrete'}>
              2. Shipping
            </li>
            <li className="text-ui-concrete" aria-hidden="true">/</li>
            <li className="text-ui-concrete">3. Payment</li>
          </ol>

          {rehydrating ? (
            <p className="text-ui-concrete text-sm uppercase tracking-widest">Loading…</p>
          ) : phase === 'information' ? (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="First name" name="firstName" error={errors.firstName?.message} required>
                  {(aria) => <Input type="text" autoComplete="given-name" {...aria} {...register('firstName')} />}
                </Field>
                <Field label="Last name" name="lastName" error={errors.lastName?.message} required>
                  {(aria) => <Input type="text" autoComplete="family-name" {...aria} {...register('lastName')} />}
                </Field>
              </div>

              <Field label="Email" name="email" error={errors.email?.message} required>
                {(aria) => <Input type="email" autoComplete="email" {...aria} {...register('email')} />}
              </Field>

              <Field label="Phone" name="phone" error={errors.phone?.message} required>
                {(aria) => <Input type="tel" autoComplete="tel" {...aria} {...register('phone')} />}
              </Field>

              <Field label="Address" name="address1" error={errors.address1?.message} required>
                {(aria) => (
                  <Input type="text" autoComplete="address-line1" placeholder="Street and number" {...aria} {...register('address1')} />
                )}
              </Field>

              <Field label="Apartment, suite, etc. (optional)" name="address2" error={errors.address2?.message}>
                {(aria) => <Input type="text" autoComplete="address-line2" {...aria} {...register('address2')} />}
              </Field>

              <Field label="City" name="city" error={errors.city?.message} required>
                {(aria) => <Input type="text" autoComplete="address-level2" {...aria} {...register('city')} />}
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-1">
                  <Field label={rules.zipLabel} name="zip" error={errors.zip?.message} required={rules.zipRequired} hint={rules.zipRequired ? undefined : 'Optional'}>
                    {(aria) => <Input type="text" autoComplete="postal-code" {...aria} {...register('zip')} />}
                  </Field>
                </div>
                <div className="sm:col-span-1">
                  <Field label="Country" name="country" error={errors.country?.message} required>
                    {(aria) => (
                      <Select {...aria} {...register('country')}>
                        <option value="">Select…</option>
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
              </div>

              {actionError ? (
                <p role="alert" className="text-xs uppercase tracking-widest font-bold text-accent-energy">
                  {actionError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent-energy text-primary-cream py-5 uppercase tracking-widest font-bold hover:bg-accent-energy/90 transition-colors disabled:opacity-60"
              >
                {submitting ? 'Loading shipping options…' : 'Continue to shipping'}
              </button>

              <div className="pt-2 text-xs uppercase tracking-widest text-ui-concrete">
                <Link href="/collection" className="hover:text-primary-cream transition-colors">
                  Continue shopping
                </Link>
              </div>
            </form>
          ) : (
            <div className="space-y-8">
              <div className="border border-ui-concrete/30 bg-apeiron-black p-5">
                <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-primary-cream">
                Shipping method
              </h2>
              <button
                type="button"
                onClick={() => setPhase('information')}
                className="text-xs uppercase tracking-widest text-ui-concrete hover:text-primary-cream transition-colors"
              >
                Edit address
              </button>
            </div>
              <div className="mt-4">
                <DeliveryOptions
                  options={options}
                  selectedHandle={selectedHandle}
                  onSelect={onSelectOption}
                  countryName={countryName}
                  currencyCode={currencyCode}
                  disabled={selecting}
                />
              </div>
              </div>

              {actionError ? (
                <p role="alert" className="text-xs uppercase tracking-widest font-bold text-accent-energy">
                  {actionError}
                </p>
              ) : null}

              <button
                type="button"
                onClick={onContinue}
                disabled={!canContinue}
                className="w-full bg-accent-energy text-primary-cream py-5 uppercase tracking-widest font-bold hover:bg-accent-energy/90 transition-colors disabled:opacity-60"
              >
                {redirecting ? 'Redirecting to payment…' : 'Continue to payment'}
              </button>

              <div className="pt-2 text-xs uppercase tracking-widest text-ui-concrete">
                <Link href="/collection" className="hover:text-primary-cream transition-colors">
                  Continue shopping
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right pane: order summary (sourced from Shopify, latest cart) */}
      <div className="w-full md:w-1/2 lg:w-2/5 bg-apeiron-black border-l border-ui-concrete/20 p-6 md:p-12 lg:p-24 flex flex-col">
        <div className="max-w-md w-full mx-auto md:mr-auto md:ml-0 xl:ml-12">
          <h2 className="text-lg font-bold uppercase tracking-widest mb-8">Order summary</h2>

          <div className="space-y-6 mb-8 max-h-[50vh] overflow-y-auto hide-scrollbar">
            {displayCart.lines.map((item) => (
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
              <span className="font-mono text-primary-cream">
                {selectedOption
                  ? formatCurrency(selectedOption.cost.amount, currencyCode)
                  : 'Calculated at checkout'}
              </span>
            </div>
          </div>

          <div className="border-t border-ui-concrete/30 mt-6 pt-6 flex justify-between items-center text-lg font-bold uppercase tracking-widest">
            <span className="text-primary-cream">{totalLabel}</span>
            <span className="font-mono text-2xl text-primary-cream">{estimatedTotal}</span>
          </div>

          <p className="mt-4 text-xs text-ui-concrete">
            {displayCart.totalAmountEstimated
              ? 'Taxes are calculated at Shopify checkout.'
              : 'Final total confirmed at checkout.'}
          </p>
        </div>
      </div>
    </div>
  );
}
