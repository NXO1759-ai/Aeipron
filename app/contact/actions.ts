'use server';

// ---------------------------------------------------------------------------
// Contact-form server action.
//
// The ONLY way the /contact client form submits a message. Re-validates the
// payload server-side with zod (never trust the client), then delivers the
// message through two independent channels (either alone is enough for the
// submission to count as sent):
//   1. EMAIL — every message is emailed to the store inbox
//      (CONTACT_EMAIL_TO, default hello@wearapeiron.com) via the Resend HTTP
//      API, with the customer's address as reply-to.
//   2. SHOPIFY — the same message is written to a `contact_message` metaobject
//      via the Admin API (`metaobjectCreate`) as a durable record in Shopify
//      admin (Settings → Custom data → Metaobjects → Contact messages).
//
// WHY THE ADMIN API (not the storefront `/contact` POST):
//   The storefront `/contact` endpoint is protected by BOTH Cloudflare bot
//   management (a "managed" JS challenge that blocks server-side `fetch` — a
//   server POST returns HTTP 403 `cf-mitigated: challenge`) AND Shopify's own
//   storefront-form captcha (`form_key` / hCaptcha) that rejects cross-origin
//   browser POSTs with "Missing CAPTCHA token". Neither is satisfiable from a
//   headless form. The Storefront API has no write mutations for content /
//   metaobjects. The Admin API is the only Shopify write surface that is not
//   behind those storefront protections (verified live: an unauthenticated
//   probe returns a clean 401, not a Cloudflare challenge).
//
// SECURITY / TRUST INVARIANTS:
//   - The client's form input is RE-VALIDATED server-side with zod before any
//     email or Shopify call.
//   - The Resend API key (`RESEND_API_KEY`) and the Admin access token
//     (`SHOPIFY_ADMIN_API_ACCESS_TOKEN`) are server-only env vars and NEVER
//     cross to the client.
//   - The email body is sent as plain text only (no HTML), so message content
//     can never inject markup into the inbox.
//   - Internal detail (Admin errors, userErrors, HTTP status) is logged
//     server-side only; the client gets a generic, non-leaking message.
//   - Bot/spam defense is a HONEYPOT + TIME-TRAP: an invisible `website`
//     field that humans never fill, and a form-mount timestamp that flags
//     submissions arriving faster than a human can type. Both drop the
//     submission with a fake success (nothing is emailed or written). If spam
//     volume outgrows this, add an IP/email rate limit or a captcha challenge.
// ---------------------------------------------------------------------------

import { contactFormSchema } from '@/lib/contact-schema';
import { adminRequest, ShopifyAdminClientError } from '@/lib/shopify/admin-client';
import { CONTACT_METAOBJECT_CREATE_MUTATION } from '@/lib/shopify/admin-queries';

/** Generic, non-leaking error message for any submission failure. */
const CONTACT_ERROR_MESSAGE = 'We could not send your message. Please try again shortly.';

/** Default metaobject type if CONTACT_METAOBJECT_TYPE env var is unset. */
const DEFAULT_METAOBJECT_TYPE = 'contact_message';

/** Default store inbox when CONTACT_EMAIL_TO is unset. */
const DEFAULT_CONTACT_EMAIL_TO = 'hello@wearapeiron.com';

/**
 * Submissions that arrive faster than this after the form mounted are bots —
 * a human cannot fill name + email + message in under 2.5 seconds.
 */
const MIN_FILL_MS = 2_500;

/**
 * Discriminated result so the client form can branch cleanly.
 * The action never throws — errors are returned as `ok: false`.
 */
export type ContactSubmitResult =
  | { ok: true }
  | { ok: false; error: string };

/** Admin API `metaobjectCreate` response shape (the parts we read). */
interface MetaobjectCreateData {
  metaobjectCreate: {
    userErrors: { field?: string[]; message: string; code?: string }[];
  } | null;
}

/**
 * Email the message to the store inbox via the Resend HTTP API
 * (https://resend.com/docs/api-reference/emails/send-email). Plain `fetch` —
 * no SDK dependency. Returns true on a 2xx, false on any failure (logged
 * server-side only; the API key is never exposed).
 */
async function sendContactEmail(fields: {
  name: string;
  email: string;
  phone?: string;
  message: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY env var is not set');
    return false;
  }
  const to = process.env.CONTACT_EMAIL_TO || DEFAULT_CONTACT_EMAIL_TO;
  const from = process.env.CONTACT_EMAIL_FROM || 'Apeiron Contact <onboarding@resend.dev>';

  // Plain-text body only — no HTML, so the message can't inject markup.
  const lines = [
    `Name: ${fields.name}`,
    `Email: ${fields.email}`,
    fields.phone ? `Phone: ${fields.phone}` : null,
    '',
    fields.message,
  ].filter((line): line is string => line !== null);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: fields.email,
        subject: `New contact message from ${fields.name}`,
        text: lines.join('\n'),
      }),
    });
    if (!res.ok) {
      console.error('[contact] email send failed with HTTP', res.status);
      return false;
    }
    return true;
  } catch {
    console.error('[contact] email send failed: network error');
    return false;
  }
}

/**
 * Write the message to a `contact_message` metaobject via the Admin API.
 * Returns true when created (empty userErrors), false on any failure.
 */
async function writeContactMetaobject(fields: {
  name: string;
  email: string;
  phone?: string;
  message: string;
}): Promise<boolean> {
  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (!token) {
    console.error('[contact] SHOPIFY_ADMIN_API_ACCESS_TOKEN env var is not set');
    return false;
  }
  const type = process.env.CONTACT_METAOBJECT_TYPE || DEFAULT_METAOBJECT_TYPE;

  // Build the metaobject fields. Shopify's MetaobjectFieldInput is `{ key,
  // value }` where value is a string — matching the single-line / multi-line
  // text fields of the `contact_message` definition. The optional phone is
  // omitted entirely when empty (no empty string stored).
  const metaobjectFields: { key: string; value: string }[] = [
    { key: 'name', value: fields.name },
    { key: 'email', value: fields.email },
    { key: 'body', value: fields.message },
  ];
  if (fields.phone) {
    metaobjectFields.push({ key: 'phone', value: fields.phone });
  }

  try {
    const data = await adminRequest<MetaobjectCreateData>(
      CONTACT_METAOBJECT_CREATE_MUTATION,
      { metaobject: { type, fields: metaobjectFields } },
    );

    // Empty userErrors === created. The mutation selects ONLY userErrors (not
    // the created metaobject), so a non-empty userErrors array (e.g.
    // UNDEFINED_OBJECT_TYPE if the definition is missing) is the failure
    // signal.
    const userErrors = data?.metaobjectCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error('[contact] metaobjectCreate failed:', JSON.stringify(userErrors));
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      '[contact] metaobject write failed:',
      err instanceof ShopifyAdminClientError ? err.message : 'unknown error',
    );
    return false;
  }
}

/**
 * Submit the contact form: email the message to the store inbox and record it
 * as a Shopify metaobject. Re-validates the payload, drops bot submissions
 * (honeypot / time-trap) with a fake success, and returns a discriminated
 * result — never throws — so the client form can render success/error states
 * without try/catch.
 */
export async function submitContactMessage(
  input: unknown,
): Promise<ContactSubmitResult> {
  // Re-validate server-side. The client already validated with the same schema,
  // but a request can be crafted directly — never trust the client.
  const parsed = contactFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Please check the highlighted fields and try again.' };
  }
  const { name, email, phone, message, website, startedAt } = parsed.data;

  // Honeypot check: the `website` field is invisible to humans (rendered
  // off-screen, aria-hidden, tabIndex -1) so only bots filling every field
  // trip it. Pretend success and drop the submission — nothing is emailed or
  // written, and the bot gets no signal to adapt. Logged server-side only.
  if (website) {
    console.warn('[contact] honeypot tripped — dropping bot submission');
    return { ok: true };
  }

  // Time-trap: a submission arriving within MIN_FILL_MS of the form mounting
  // was not typed by a human. `startedAt` comes from the client so a forged
  // value can only make a bot submission LOOK slower — never faster — which
  // keeps the check safe to skip when the field is absent.
  if (startedAt && Date.now() - startedAt < MIN_FILL_MS) {
    console.warn('[contact] time-trap tripped — dropping instant submission');
    return { ok: true };
  }

  // Deliver through both channels; either one succeeding means the message
  // reached the store.
  const [emailed, recorded] = await Promise.all([
    sendContactEmail({ name, email, phone, message }),
    writeContactMetaobject({ name, email, phone, message }),
  ]);

  if (!emailed && !recorded) {
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
  return { ok: true };
}
