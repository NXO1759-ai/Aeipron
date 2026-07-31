'use client';

// ---------------------------------------------------------------------------
// ReviewForm — the interactive half of /review: product picker (pre-selected
// from the email's ?product= param), star rating, optional title, body, name
// + email, then POST /api/review which forwards to Judge.me.
//
// Chrome mirrors the site's dialogs/forms: bordered inputs on obsidian,
// cream submit, accent-energy errors. The hidden `company` field is a
// honeypot — invisible to humans, catnip for bots (the API fake-succeeds it).
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { ArrowRight, Star } from 'lucide-react';
import type { ReviewableProduct } from '@/lib/review-products';

export function ReviewForm({
  products,
  preselect,
  loadFailed,
}: {
  products: ReviewableProduct[];
  preselect?: string;
  loadFailed: boolean;
}) {
  const initial = products.find((p) => p.handle === preselect);
  const [productId, setProductId] = useState(initial ? String(initial.productId) : '');
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [review, setReview] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productId) return setError('Choose the product you are reviewing');
    if (rating < 1) return setError('Choose a star rating');
    if (!review.trim()) return setError('Write your review');
    if (!name.trim()) return setError('Enter your name');
    if (!email.trim()) return setError('Enter your email');

    setSubmitting(true);
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: Number(productId),
          rating,
          title: title.trim() || undefined,
          review: review.trim(),
          name: name.trim(),
          email: email.trim(),
          company,
        }),
      });
      if (!res.ok) throw new Error(`submit failed: ${res.status}`);
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mt-6 border border-ui-concrete/20 bg-primary-obsidian p-6">
        <p className="text-sm font-bold uppercase tracking-widest text-primary-cream">
          Thank you
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ui-concrete">
          Your review was submitted. It will appear on the product page once it
          is published.
        </p>
      </div>
    );
  }

  const inputClass =
    'w-full bg-apeiron-black border border-ui-concrete/30 px-4 py-3 text-sm text-primary-cream placeholder:text-ui-concrete/60 focus:outline-none focus:border-primary-cream transition-colors disabled:opacity-60';
  const labelClass = 'block text-[10px] uppercase tracking-widest font-bold text-ui-concrete';

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
      {loadFailed || products.length === 0 ? (
        <p role="alert" className="text-xs uppercase tracking-widest font-bold text-accent-energy">
          Products could not be loaded. Please try again later.
        </p>
      ) : null}

      <div>
        <label htmlFor="review-product" className={labelClass}>
          Product
        </label>
        <select
          id="review-product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={submitting || products.length === 0}
          className={`${inputClass} mt-2`}
        >
          <option value="" disabled>
            Select a product
          </option>
          {products.map((p) => (
            <option key={p.handle} value={p.productId}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={labelClass}>Rating</span>
        <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= (hover || rating);
            return (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                className={`cursor-pointer p-1 transition-colors ${
                  active ? 'text-primary-cream' : 'text-ui-concrete/40'
                } hover:text-primary-cream`}
              >
                <Star className="w-6 h-6" fill={active ? 'currentColor' : 'none'} />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="review-title" className={labelClass}>
          Review title (optional)
        </label>
        <input
          id="review-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sums it up in a line"
          maxLength={200}
          disabled={submitting}
          className={`${inputClass} mt-2`}
        />
      </div>

      <div>
        <label htmlFor="review-body" className={labelClass}>
          Your review
        </label>
        <textarea
          id="review-body"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Fit, fabric, quality — how was it?"
          rows={5}
          maxLength={5000}
          disabled={submitting}
          className={`${inputClass} mt-2 resize-y`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="review-name" className={labelClass}>
            Name
          </label>
          <input
            id="review-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            maxLength={100}
            disabled={submitting}
            className={`${inputClass} mt-2`}
          />
        </div>
        <div>
          <label htmlFor="review-email" className={labelClass}>
            Email
          </label>
          <input
            id="review-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={submitting}
            className={`${inputClass} mt-2`}
          />
        </div>
      </div>

      {/* Honeypot — hidden from humans, filled only by bots. */}
      <input
        type="text"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        name="company"
      />

      {error ? (
        <p role="alert" className="text-xs uppercase tracking-widest font-bold text-accent-energy">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-primary-cream text-apeiron-black px-4 py-3 flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold hover:bg-apeiron-ivory transition-colors disabled:opacity-60"
      >
        Submit review
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
