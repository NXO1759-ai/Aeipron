'use client';

// ---------------------------------------------------------------------------
// NewsletterForm — the "Join the List" email capture in the footer.
//
// Submits directly to Klaviyo's client-side subscription endpoint
// (POST /client/subscriptions?company_id=…) — the only Klaviyo endpoint
// designed for browser calls, authenticated by the PUBLIC API key (site ID),
// which is safe to ship in client code by design. No private key anywhere in
// the frontend; no server route needed (Klaviyo forbids calling this endpoint
// server-side).
//
//   · KLAVIYO_LIST_ID: once the newsletter list ID is known, paste it below —
//     signups then land in that list (and can trigger its welcome flow).
//     Until then the call records email-marketing consent on the profile
//     without list membership. If the list uses double opt-in, Klaviyo sends
//     its own confirmation email; the profile is not marketing-subscribed
//     until they confirm — that is Klaviyo's flow, not ours to duplicate.
//   · Failure modes (network error, ad-blocker blocking a.klaviyo.com, Klaviyo
//     4xx/5xx) surface as the form's error state — the fake "always succeeds"
//     behaviour is gone.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Klaviyo public API key (site ID) — designed to be exposed in browser code. */
const KLAVIYO_COMPANY_ID = 'SLbERg';

/** Newsletter list ID (Klaviyo → Audience → Lists & Segments → list → Settings).
 * Empty = consent-only subscribe (no list membership, no welcome flow). */
const KLAVIYO_LIST_ID = '';

/** Stable API revision; older revisions treat the list relationship as
 * optional, which keeps consent-only signups working until the list ID lands. */
const KLAVIYO_REVISION = '2024-10-15';

async function subscribeToKlaviyo(email: string): Promise<void> {
  const body = {
    data: {
      type: 'subscription',
      attributes: {
        custom_source: 'Footer — Join the List',
        profile: {
          data: {
            type: 'profile',
            attributes: {
              email,
              subscriptions: {
                email: { marketing: { consent: 'SUBSCRIBED' } },
              },
            },
          },
        },
      },
      ...(KLAVIYO_LIST_ID
        ? { relationships: { list: { data: { type: 'list', id: KLAVIYO_LIST_ID } } } }
        : {}),
    },
  };

  const res = await fetch(
    `https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_COMPANY_ID}`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.api+json',
        'content-type': 'application/vnd.api+json',
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify(body),
    },
  );

  // Success is 202 Accepted with an empty body; anything else is a real error.
  if (!res.ok) throw new Error(`Klaviyo subscribe failed: ${res.status}`);
}

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email');
      return;
    }

    setSubmitting(true);
    try {
      await subscribeToKlaviyo(email.trim());
      setDone(true);
      setEmail('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <p className="text-ui-concrete text-xs uppercase tracking-widest">
        You&rsquo;re on the list.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2">
      <div className="flex items-stretch">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          autoComplete="email"
          aria-label="Email address"
          disabled={submitting}
          className="flex-1 bg-apeiron-black border border-ui-concrete/30 border-r-0 px-4 py-3 text-sm text-primary-cream placeholder:text-ui-concrete/60 focus:outline-none focus:border-primary-cream transition-colors disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting}
          aria-label="Subscribe"
          className="bg-primary-cream text-apeiron-black px-4 flex items-center justify-center hover:bg-apeiron-ivory transition-colors disabled:opacity-60"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs uppercase tracking-widest font-bold text-accent-energy">
          {error}
        </p>
      ) : null}
    </form>
  );
}
