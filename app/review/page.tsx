import type { Metadata } from 'next';
import { getReviewableProducts, type ReviewableProduct } from '@/lib/review-products';
import { ReviewForm } from './review-form';

// ---------------------------------------------------------------------------
// /review — the review-submission page that review-request emails link to.
//
// Email link format:  https://<domain>/review?product=<product-handle>
// The ?product= param pre-selects that product in the picker; without it the
// customer picks any product from the dropdown. Dynamic per-request (it reads
// searchParams), noindex — this is a form, not content.
//
// The product list comes from Shopify at request time (server-side); if that
// fetch fails the form still renders and shows its own error notice instead
// of a 500.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Apeiron — Write a Review',
  robots: { index: false, follow: false },
};

export default async function ReviewPage({
  searchParams,
}: {
  // Next 15 always passes searchParams as a Promise (and its generated route
  // types REQUIRE the Promise form — a plain-object union fails the build).
  searchParams: Promise<{ product?: string }>;
}) {
  const sp = await searchParams;
  const preselect = typeof sp.product === 'string' ? sp.product : undefined;

  let products: ReviewableProduct[] = [];
  let loadFailed = false;
  try {
    products = await getReviewableProducts();
  } catch {
    loadFailed = true;
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-24">
      <div className="w-full max-w-lg">
        <h1 className="text-lg font-semibold uppercase tracking-tight text-apeiron-ivory leading-none">
          Write a Review
        </h1>
        <p className="mt-4 text-xs uppercase tracking-widest text-ui-concrete">
          Thank you for shopping with Apeiron. Tell us how it went.
        </p>
        <ReviewForm products={products} preselect={preselect} loadFailed={loadFailed} />
      </div>
    </main>
  );
}
