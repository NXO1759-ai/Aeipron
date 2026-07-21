import { z } from 'zod';

// ---------------------------------------------------------------------------
// Contact-form schema (zod 4).
//
// Pure module — no DOM, no server-only imports — so it is unit-testable in
// the Vitest `node` environment and importable from the 'use client' ContactForm.
// The browser validates here for fast, field-level feedback; the server action
// re-validates defensively (never trust the client) before delivering the
// message (see app/contact/actions.ts).
//
// The fields map onto the metaobject definition the store must define:
//   name   → contact_message.name   (single-line text, required)
//   email  → contact_message.email  (single-line text, required)
//   phone  → contact_message.phone  (single-line text, optional)
//   body   → contact_message.body   (multi-line text, required)
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
  // Honeypot — an invisible field that humans never fill but bots
  // indiscriminately do. Optional so older clients / direct API posts without
  // it still validate; the server action silently drops submissions where it
  // is non-empty (fake success, nothing is emailed or written to Shopify).
  website: z.string().max(200).optional(),
  // Time-trap — the client stamps Date.now() when the form mounts; a
  // submission that arrives implausibly fast (< MIN_FILL_MS in the action) is
  // a bot filling the form programmatically. Optional so the field's absence
  // never blocks a real submission.
  startedAt: z.number().int().positive().optional(),
});

/** The parsed, validated contact-form payload. */
export type ContactForm = z.infer<typeof contactFormSchema>;
