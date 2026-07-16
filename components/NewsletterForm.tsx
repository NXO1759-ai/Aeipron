'use client';

// ---------------------------------------------------------------------------
// NewsletterForm — the "Stay in the Loop" email capture in the footer.
//
// A lightweight client form: email input + arrow submit button. For now it
// validates an email format and shows a success state; wiring it to an actual
// email service (Shopify Customers, Mailchimp, Klaviyo, etc.) is a future step.
// When that happens, replace the simulated async block with a server action and
// surface the server error via setError.
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      // Simulated async submit. Replace with a server action / ESP call.
      await new Promise((resolve) => setTimeout(resolve, 400));
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
