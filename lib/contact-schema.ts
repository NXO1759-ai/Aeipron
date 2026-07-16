import { z } from 'zod';

// ---------------------------------------------------------------------------
// Contact-form schema (zod 4).
//
// Pure module — no DOM, no server-only imports — so it is unit-testable in the
// Vitest `node` environment and importable from the 'use client' ContactForm.
// The browser validates here for fast, field-level feedback; the server action
// re-validates defensively in `app/contact/actions.ts` (never trust the
// client) before POSTing to Shopify's contact endpoint.
//
// The fields map onto Shopify's native contact form inputs:
//   contact[name]  → name   (single line)
//   contact[email] → email  (required by Shopify)
//   contact[phone] → phone  (optional)
//   contact[body]  → message (the message body Shopify emails to the store)
// ---------------------------------------------------------------------------

/** Lenient phone pattern: optional +, then 0-20 of digits/spaces/dashes/parens/dots. */
const PHONE_REGEX = /^[+]?[\d\s().-]{0,20}$/;

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email')
    .max(120),
  phone: z
    .string()
    .trim()
    .max(20, 'Phone is too long')
    .regex(PHONE_REGEX, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message is too long (5000 character max)'),
});

/** The parsed, validated contact-form payload. */
export type ContactForm = z.infer<typeof contactFormSchema>;