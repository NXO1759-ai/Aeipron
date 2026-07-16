'use server';

// ---------------------------------------------------------------------------
// Contact-form server action.
//
// The ONLY way the /contact client form submits a message. Mirrors the
// checkout/cart server-action pattern ('use server', re-validate server-side,
// log internal detail server-side, return a non-leaking message to the
// client) but with one key difference from the GraphQL actions: this does NOT
// go through the Storefront API — the Storefront API has no contact-form
// submission mutation. Instead it POSTs server-side to Shopify's NATIVE
// contact-form endpoint (`/contact`), the same backend the Liquid
// `{% form 'contact' %}` posts to. Submissions therefore land in the store's
// sender email inbox AND in Shopify admin (Online Store → ... / store email),
// exactly like a themed storefront — but the form lives in our headless UI.
//
// WHY SERVER-SIDE POST (not a browser fetch):
//   - Shopify serves *.myshopify.com pages with X-Frame-Options: DENY and a
//     frame-ancestors CSP, so embedding the native contact page in an iframe
//     is refused. A browser-side fetch to /contact would also be blocked by
//     CORS (no permissive headers on the contact endpoint). POSTing from the
//     Next.js server avoids both — same-origin rules don't apply server-side.
//   - The contact form is a public, tokenless endpoint (no CSRF token, no
//     session) so a server-side POST is processed identically to a themed one.
//
// CAVEAT (documented for the engineer / live-test): Shopify's `/contact` POST
// route is part of the Online Store. A purely-headless store with the Online
// Store DISABLED may not route `/contact`, or may be behind the storefront
// password. If the live test fails, verify (a) the Online Store is published
// and (b) no storefront password is set, then retry. Success is detected by the
// `contact_posted=true` query param Shopify appends to its redirect target.
//
// SECURITY / TRUST INVARIANTS:
//   - The client's form input is RE-VALIDATED server-side with the zod schema
//     (never trust the client) before any Shopify call.
//   - Internal detail (domain, fetch errors, status) is logged server-side
//     only; the client gets a generic, non-leaking message.
//   - No Shopify access token is sent — the contact endpoint is public; the
//     SHOPIFY_STORE_DOMAIN env var is used only to build the endpoint URL.
//   - There is NO rate limiting in this action. A malicious actor can submit
//     many messages. If spam becomes a problem, add either (a) a simple
//     in-memory rate limit keyed by IP/email, (b) hCaptcha / Google reCAPTCHA,
//     or (c) move submissions to a metaobject written via the Admin API where
//     Shopify's spam filters can be leveraged.
// ---------------------------------------------------------------------------

import { contactFormSchema } from '@/lib/contact-schema';

/** Generic, non-leaking error message for any submission failure. */
const CONTACT_ERROR_MESSAGE = 'We could not send your message. Please try again shortly.';

/** Hard timeout for the server-side POST to Shopify (ms). */
const POST_TIMEOUT_MS = 12_000;

/**
 * Discriminated result so the client form can branch cleanly.
 * The action never throws — errors are returned as `ok: false`.
 */
export type ContactSubmitResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Submit the contact form to Shopify's native `/contact` endpoint.
 *
 * Re-validates the payload server-side, encodes it as
 * `application/x-www-form-urlencoded` (`form_type=contact`, `utf8=✓`, and the
 * `contact[...]` fields Shopify expects), POSTs with redirects followed, and
 * detects success via the `contact_posted=true` query param Shopify appends
 * to the redirect target URL. Returns a discriminated result — never throws —
 * so the client form can render success/error states without try/catch.
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
  const { name, email, phone, message } = parsed.data;

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) {
    console.error('[contact] SHOPIFY_STORE_DOMAIN env var is not set');
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
  const endpoint = `https://${domain}/contact`;

  // Encode the Shopify contact-form fields. `contact[body]` is the message;
  // `contact[name]`/`contact[email]`/`contact[phone]` map 1:1. URLSearchParams
  // percent-encodes values (the `[]` in keys are sent encoded, which Shopify
  // accepts — this matches a browser form submission's encoding).
  const params = new URLSearchParams();
  params.set('form_type', 'contact');
  params.set('utf8', '✓');
  params.set('contact[name]', name);
  params.set('contact[email]', email);
  if (phone) params.set('contact[phone]', phone);
  params.set('contact[body]', message);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
      },
      body: params.toString(),
      // AbortSignal.timeout is available in Node 18+ (the runtime this Next.js
      // app targets) and avoids a dangling setTimeout if fetch throws before
      // the timeout fires.
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });

    // Shopify redirects (302) after handling the contact POST. On success the
    // final URL carries `contact_posted=true`; its absence means a failure
    // (validation rejected, storefront locked, /contact not routed, etc.).
    // `response.url` is the final URL after following redirects.
    const success = Boolean(response.url) && response.url.includes('contact_posted=true');
    if (success) {
      return { ok: true };
    }
    console.error(
      '[contact] Shopify did not confirm submission (final URL did not contain contact_posted=true)',
    );
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  } catch (err) {
    // Network error / abort / DNS failure. Log the error name server-side only
    // (no payload or token to leak); the client gets the generic message.
    console.error('[contact] submit failed:', (err as Error)?.name ?? 'unknown error');
    return { ok: false, error: CONTACT_ERROR_MESSAGE };
  }
}