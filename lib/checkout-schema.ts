import { z } from 'zod';
import { addressRulesFor, isValidCountryCode, COUNTRIES } from '@/lib/countries';

// ---------------------------------------------------------------------------
// Checkout contact + address form schema (zod 4).
//
// Pure module — no DOM, no server-only imports — so it is unit-testable in the
// Vitest `node` environment and importable from the 'use client'
// CheckoutExperience. The browser validates here for fast, field-level
// feedback; the server re-validates defensively in the server action (never
// trust the client).
//
// Country-driven rules: province/zip requirements + patterns come from
// lib/countries.ts (US state+ZIP, CA province+postal, etc.). A superRefine reads
// the selected country and applies the right rules so one schema serves all
// markets. The phone field is required (Shopify shipping uses it) but validated
// leniently — digits, +, spaces, dashes, parentheses — so we never block a
// legitimate international number on format pedantry.
// ---------------------------------------------------------------------------

/** Lenient phone pattern: optional +, then 7-20 of digits/spaces/dashes/parens/dots. */
const PHONE_REGEX = /^[+]?[\d\s().-]{7,20}$/;

/** Base shape — country-agnostic. Country-specific rules are added in superRefine. */
export const checkoutContactSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(60),
    lastName: z.string().trim().min(1, 'Last name is required').max(60),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email').max(120),
    phone: z
      .string()
      .trim()
      .min(1, 'Phone number is required')
      .regex(PHONE_REGEX, 'Enter a valid phone number')
      .max(20),
    address1: z.string().trim().min(1, 'Address is required').max(120),
    address2: z.string().trim().max(120).optional().or(z.literal('')),
    city: z.string().trim().min(1, 'City is required').max(80),
    province: z.string().trim().max(80).optional().or(z.literal('')),
    zip: z.string().trim().max(20).optional().or(z.literal('')),
    country: z.string().trim().min(1, 'Country is required'),
  })
  .superRefine((data, ctx) => {
    // Reject unknown country codes early (a tampered/custom value should never
    // reach Shopify). Use a field-level issue so the <select> shows the error.
    if (data.country && !isValidCountryCode(data.country)) {
      ctx.addIssue({
        code: 'custom',
        path: ['country'],
        message: 'Select a valid country',
      });
      return;
    }

    const rules = addressRulesFor(data.country);

    // Province / subdivision.
    if (rules.requiresProvince && !data.province) {
      ctx.addIssue({
        code: 'custom',
        path: ['province'],
        message: `${rules.provinceLabel} is required`,
      });
    } else if (rules.provincePattern && data.province) {
      const re = new RegExp(rules.provincePattern);
      if (!re.test(data.province)) {
        ctx.addIssue({
          code: 'custom',
          path: ['province'],
          message: `Enter a valid ${rules.provinceLabel.toLowerCase()}`,
        });
      }
    }

    // Postal code.
    if (rules.zipRequired && !data.zip) {
      ctx.addIssue({
        code: 'custom',
        path: ['zip'],
        message: `${rules.zipLabel} is required`,
      });
    } else if (rules.zipPattern && data.zip) {
      const re = new RegExp(rules.zipPattern);
      if (!re.test(data.zip)) {
        ctx.addIssue({
          code: 'custom',
          path: ['zip'],
          message: `Enter a valid ${rules.zipLabel.toLowerCase()}`,
        });
      }
    }
  });

/** The parsed, validated contact + address form payload. */
export type CheckoutContact = z.infer<typeof checkoutContactSchema>;

/**
 * Build the buyer-identity + delivery-address input for the Shopify mutation
 * from a validated {@link CheckoutContact}. Province is passed as
 * `provinceCode` only when present; country is always the ISO code. No price
 * is ever included — the browser never sends one (trust invariant).
 */
export function toShopifyAddress(input: CheckoutContact) {
  return {
    // cartBuyerIdentityInput
    buyerIdentity: {
      email: input.email,
      phone: input.phone,
      countryCode: input.country,
    },
    // cartDeliveryAddressesAdd → addresses[].address.deliveryAddress
    deliveryAddress: {
      firstName: input.firstName,
      lastName: input.lastName,
      address1: input.address1,
      address2: input.address2 || undefined,
      city: input.city,
      provinceCode: input.province || undefined,
      zip: input.zip || undefined,
      countryCode: input.country,
      phone: input.phone,
    },
  };
}

/** Re-export the country list for the <select> (keeps the import surface small). */
export { COUNTRIES };