'use client';

import { useEffect, useState } from 'react';
import { FitScale } from '@/components/product/FitScale';
import type { ProductReview, ProductReviewData } from '@/lib/judge-me';

// ---------------------------------------------------------------------------
// ReviewsSection — the body of the PDP "Reviews" disclosure.
//
//   1. FitScale          — the Smaller…Larger marker (driven by the
//                          custom.review json metafield via product.fit)
//   2. Thumbs            — thumbs-up counts the 5★ + 4★ reviews, thumbs-down
//                          counts the 1★ reviews (2–3★ show only in Details).
//                          Display-only counters, not vote buttons.
//   3. Details           — minimal button opening a pop-up with every review,
//                          5★ → 1★ (sorted server-side in lib/judge-me).
//
// All review data arrives by props from the server (app/product/[slug]/page)
// — nothing here calls Judge.me from the browser, so the API token is never
// exposed. When Judge.me is unconfigured/unreachable (data.ok === false) the
// section still renders: counters rest at 0 and the pop-up shows the empty
// state, so the page never breaks pre-launch.
// ---------------------------------------------------------------------------

function ThumbIcon({ direction }: { direction: 'up' | 'down' }) {
  // Lucide-style hand glyphs, stroke-only (brand line style, currentColor).
  return direction === 'up' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function ThumbCounter({ direction, count, label }: { direction: 'up' | 'down'; count: number; label: string }) {
  return (
    <div className="relative inline-flex text-primary-cream" role="img" aria-label={`${count} ${label}`}>
      <ThumbIcon direction={direction} />
      <span
        aria-hidden="true"
        className="absolute -top-2 -right-3 min-w-5 rounded-full bg-accent-energy px-1 text-center font-mono text-[10px] font-bold leading-5 text-primary-obsidian"
      >
        {count}
      </span>
    </div>
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="text-sm leading-none tracking-tight" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} aria-hidden="true" className={star <= rating ? 'text-primary-cream' : 'text-ui-concrete/30'}>
          ★
        </span>
      ))}
    </span>
  );
}

function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReviewCard({ review }: { review: ProductReview }) {
  const date = formatReviewDate(review.createdAt);
  return (
    <article className="border-b border-ui-concrete/20 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <StarRow rating={review.rating} />
        {date ? <span className="text-xs text-ui-concrete">{date}</span> : null}
      </div>
      {review.title ? <p className="mt-2 text-sm font-bold text-primary-cream">{review.title}</p> : null}
      {review.body ? <p className="mt-1 text-sm leading-relaxed text-ui-concrete">{review.body}</p> : null}
      <p className="mt-2 text-xs uppercase tracking-widest text-ui-concrete">{review.author}</p>
    </article>
  );
}

function ReviewsModal({ data, onClose }: { data: ProductReviewData; onClose: () => void }) {
  // Esc closes; page scroll locks while the pop-up is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-apeiron-black/85 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customer reviews"
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto overscroll-contain border border-ui-concrete/20 bg-primary-obsidian p-6 animate-[modal-in_200ms_ease-out] md:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary-cream">
            Reviews{data.summary.total > 0 ? ` (${data.summary.total})` : ''}
          </h3>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close reviews"
            className="cursor-pointer text-xl leading-none text-ui-concrete transition-colors hover:text-primary-cream"
          >
            ×
          </button>
        </div>

        {data.reviews.length === 0 ? (
          <p className="mt-6 text-sm italic text-ui-concrete">No reviews yet.</p>
        ) : (
          <div className="mt-2">
            {data.reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReviewsSection({ fit, data }: { fit: number; data: ProductReviewData }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="space-y-8 pt-2">
      <FitScale fit={fit} />

      <div className="flex items-center gap-10">
        <ThumbCounter direction="up" count={data.summary.thumbsUp} label="positive reviews (4–5 stars)" />
        <ThumbCounter direction="down" count={data.summary.thumbsDown} label="negative reviews (1 star)" />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="cursor-pointer text-xs font-bold uppercase tracking-widest text-ui-concrete underline underline-offset-4 transition-colors hover:text-primary-cream"
        >
          Details
        </button>
      </div>

      {detailsOpen ? <ReviewsModal data={data} onClose={() => setDetailsOpen(false)} /> : null}
    </div>
  );
}
