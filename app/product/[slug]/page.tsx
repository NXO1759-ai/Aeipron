import { notFound } from 'next/navigation';
import { getProductBySlug } from '@/lib/catalog';
import { getProductReviewData } from '@/lib/judge-me';
import { ProductExperience } from './ProductExperience';

// Shopify reads are network calls — don't prerender at build time.
export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Resolve the actual product. Unknown slugs render the 404 boundary instead
  // of silently falling back to a hardcoded item. Judge.me reviews load in
  // parallel (slug === Shopify product handle, which is also the Judge.me
  // product_handle); any Judge.me failure resolves to the empty state, never
  // to a page error.
  const [product, reviewData] = await Promise.all([getProductBySlug(slug), getProductReviewData(slug)]);
  if (!product) notFound();

  // The gallery + buybox live in one client island (ProductExperience) so the
  // gallery image can follow the selected variant (like the price) while
  // sharing a single selection source of truth.
  return <ProductExperience product={product} reviewData={reviewData} />;
}
