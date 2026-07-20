'use server';

// ---------------------------------------------------------------------------
// Contact-form server action.
//
// The ONLY way the /contact client form submits a message. Re-validates the
// payload server-side with zod (never trust the client), then writes a
// `contact_message` metaobject to Shopify via the Admin API
// (`metaobjectCreate`). The submission therefore lands in Shopify admin
// (Settings → Custom data → Metaobjects → Contact messages), and — if the
// store has a Shopify Flow wired to "metaobject created → send email" — is
// also emailed to the store inbox (hello@wearapeiron.com).
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
//     Shopify call.
//   - The Admin access token (`SHOPIFY_ADMIN_API_ACCESS_TOKEN`) is read from a
//     server-only env var and NEVER crosses to the client. The action imports
//     `lib/shopify/admin-client` + `lib/shopify/admin-queries`, both
//     `server-only`, so a client import of this action cannot leak them.
//   - Internal detail (Admin errors, userErrors, status) is logged
//     server-side only; the client gets a generic, non-leaking message.
//   - Bot/spam defense is a HONEYPOT: the form renders an invisible `website`
//     field that humans never fill; a non-empty value drops the submission
//     with a fake success (nothing is written to Shopify). If spam volume
//     outgrows it, add an IP/email rate limit or a captcha challenge.
// ---------------------------------------------------------------------------

import { contactFormSchema } from '@/lib/contact-schema';
import { adminRequest, ShopifyAdminClientError } from '@/lib/shopify/admin-client';
import { CONTACT_METAOBJECT_CREATE_MUTATION } from '@/lib/shopify/admin-queries';

/** Generic, non-leaking error message for any submission failure. */
const CONTACT_ERROR_MESSAGE = 'We could not send your message. Please try again shortly.';

/** Default metaobject type if CONTACT_METAOBJECT_TYPE env var is unset. */
const DEFAULT_METAOBJECT_TYPE = 'contact_message';

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
 * Submit the contact form to Shopify as a `contact_message` metaobject via the
 * Admin API. Re-validates the payload, builds the metaobject fields, calls
 * `metaobjectCreate`, and returns a discriminated result — never throws — so
 * the client form can render success/error states without try/catch.
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
  const { name, email, phone, message, website } = parsed.data;

  // Honeypot check: the `website` field is invisible to humans (rendered
  // off-screen, aria-hidden, tabIndex -1) so only bots filling every field
  // trip it. Pretend success and drop the submission — nothing is written to
  // Shopify, and the bot gets no signal to adapt. Logged server-side only.
  if (website) {
    console.warn('[contact] honeypot tripped — dropping bot submission');
    return { ok: true };
  }

  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (!token) {
    console.error('[contact] SHOPIFY_ADMIN_API_ACCESS_TOKEN env var is not set');
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
  const type = process.env.CONTACT_METAOBJECT_TYPE || DEFAULT_METAOBJECT_TYPE;

  // Build the metaobject fields. Shopify's MetaobjectFieldInput is `{ key,
  // value }` where value is a string — matching the single-line / multi-line
  // text fields of the `contact_message` definition. The optional phone is
  // omitted entirely when empty (no empty string stored).
  const fields: { key: string; value: string }[] = [
    { key: 'name', value: name },
    { key: 'email', value: email },
    { key: 'body', value: message },
  ];
  if (phone) {
    fields.push({ key: 'phone', value: phone });
  }

  try {
    const data = await adminRequest<MetaobjectCreateData>(
      CONTACT_METAOBJECT_CREATE_MUTATION,
      { metaobject: { type, fields } },
    );

    // Empty userErrors === created. The mutation selects ONLY userErrors (not
    // the created metaobject), so there is no `metaobject` field to check — a
    // non-empty userErrors array (e.g. UNDEFINED_OBJECT_TYPE if the definition
    // is missing) is the failure signal. See admin-queries.ts for why the
    // metaobject selection was dropped (it needs read_metaobjects and would
    // cause a false failure on a successful create).
    const userErrors = data?.metaobjectCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      // e.g. the `contact_message` definition does not exist, or a field key is
      // wrong. Log server-side only; the client gets the generic message.
      console.error('[contact] metaobjectCreate failed:', JSON.stringify(userErrors));
      return { ok: false, error: CONTACT_ERROR_MESSAGE };
    }
    return { ok: true };
  } catch (err) {
    // Network / auth / top-level GraphQL error. Log the message name
    // server-side only (no payload or token to leak); client gets the generic
    // message.
    console.error(
      '[contact] submit failed:',
      err instanceof ShopifyAdminClientError ? err.message : 'unknown error',
    );
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
}
