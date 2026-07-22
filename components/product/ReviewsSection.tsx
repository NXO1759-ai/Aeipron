'use client';

import { useEffect, useState } from 'react';
import { FitScale } from '@/components/product/FitScale';
import { useDialogExit } from '@/hooks/use-dialog-exit';
import type { ProductReview, ProductReviewData } from '@/lib/judge-me';

// ---------------------------------------------------------------------------
// ReviewsSection — the Reviews disclosure body: 1. FitScale (always) 2. Thumbs
// 3. Details (pop-up with all reviews).
//
// Data posture (lib/judge-me.ts): the parent page fetches reviews SERVER-SIDE
// and passes them down; any fetch/parse failure resolves to the EMPTY_DATA
// state — never a rendered error, never a broken section. When there are no
// reviews yet the section shows the fit scale (metafield-driven, always
// available) and an honest empty state — no fabricated social proof.
// ---------------------------------------------------------------------------

/** Star display: filled cream stars for the rating, concrete for the rest. */
function Stars({ rating }: { rating: number }) {
  return (
    <div role="img" aria-label={`${rating} out of 5 stars`} className="flex gap-0.5 text-sm">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          aria-hidden="true"
          className={star <= rating ? 'text-primary-cream' : 'text-ui-concrete/40'}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: ProductReview }) {
  return (
    <article className="border-t border-ui-concrete/20 pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <Stars rating={review.rating} />
        <time className="text-xs text-ui-concrete" dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </time>
      </div>
      {review.title ? (
        <h4 className="mt-2 text-sm font-bold uppercase tracking-widest">{review.title}</h4>
      ) : null}
      <p className="mt-1 text-sm leading-relaxed text-ui-concrete">{review.body}</p>
      <p className="mt-2 text-xs uppercase tracking-widest text-ui-concrete">{review.author}</p>
    </article>
  );
}

/** The full-reviews pop-up: all reviews in a scrollable dialog. */
function ReviewsModal({ data, onClose }: { data: ProductReviewData; onClose: () => void }) {
  // Esc/backdrop/× all route through requestClose so the pop-up plays its
  // outro (backdrop fade + panel drift) before unmounting.
  const { closing, requestClose } = useDialogExit(onClose);

  // Esc closes; page scroll locks while the pop-up is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-apeiron-black/85 p-4 sm:items-center ${
        closing ? 'dialog-backdrop-out' : 'dialog-backdrop-in'
      }`}
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customer reviews"
        className={`max-h-[80vh] w-full max-w-lg overflow-y-auto overscroll-contain border border-ui-concrete/20 bg-primary-obsidian p-6 md:p-8 ${
          closing ? 'dialog-panel-out' : 'dialog-panel-in'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest">Reviews</h3>
            <p className="mt-1 text-xs uppercase tracking-widest text-ui-concrete">
              {data.summary.average} average · {data.summary.total} {data.summary.total === 1 ? 'review' : 'reviews'}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            autoFocus
            aria-label="Close reviews"
            className="cursor-pointer text-xl leading-none text-ui-concrete transition-colors hover:text-primary-cream"
          >
            ×
          </button>
        </div>
        <div className="mt-6 space-y-4">
          {data.reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReviewsSection({ fit, data }: { fit: number; data: ProductReviewData }) {
  const [open, setOpen] = useState(false);
  const { summary, reviews } = data;

  return (
    <div className="space-y-4 text-sm leading-relaxed text-ui-concrete">
      {/* 1. Fit scale — always rendered (metafield-driven; lib/fit.ts). */}
      <FitScale fit={fit} />

      {/* 2. Thumbs + 3. Details — only when reviews exist; otherwise an honest
          empty state (no fabricated stars or counts). */}
      {summary.total > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Stars rating={Math.round(summary.average)} />
            <span className="text-xs uppercase tracking-widest text-ui-concrete">
              {summary.average} · {summary.total} {summary.total === 1 ? 'review' : 'reviews'}
            </span>
          </div>
          <p className="text-xs uppercase tracking-widest text-ui-concrete">
            {summary.thumbsUp} of {summary.thumbsUp + summary.thumbsDown} recommend this
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="cursor-pointer text-xs font-bold uppercase tracking-widest text-primary-cream underline underline-offset-4 transition-colors hover:text-accent-energy"
          >
            Details
          </button>
        </div>
      ) : (
        <p className="text-xs uppercase tracking-widest text-ui-concrete">
          No reviews yet — be the first after checkout.
        </p>
      )}

      {open ? <ReviewsModal data={data} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
