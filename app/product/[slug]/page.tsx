import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductBySlug } from '@/lib/catalog';
import { getProductReviewData } from '@/lib/judge-me';
import { ProductExperience } from './ProductExperience';

// ISR: serve a cached page and revalidate in the background every 5 minutes.
// Product/price changes appear within one window; a Shopify outage serves the
// last good render instead of the error boundary. Slugs are rendered on-demand
// (no generateStaticParams), so nothing calls Shopify at build time.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // React cache() in lib/catalog dedupes this with the page render's read.
  // A Shopify failure degrades to default metadata — invariant: failures
  // degrade, they don't throw.
  const product = await getProductBySlug(slug).catch((error) => {
    console.error('[product] catalog read failed:', error);
    return null;
  });
  if (!product) return {};
  const description =
    product.description.replace(/\s+/g, ' ').trim().slice(0, 160) ||
    `${product.name} — heavyweight essentials by Apeiron.`;
  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      images: product.images.length > 0 ? [{ url: product.images[0], alt: product.name }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Resolve the actual product. Unknown slugs render the 404 boundary instead
  // of silently falling back to a hardcoded item. A Shopify failure degrades
  // to the same 404 boundary rather than a 500 — consistent with /shop and
  // /collection (invariant: failures degrade, they don't throw). Judge.me
  // reviews load in parallel (slug === Shopify product handle, which is also
  // the Judge.me product_handle); any Judge.me failure resolves to the empty
  // state, never to a page error.
  const [product, reviewData] = await Promise.all([
    getProductBySlug(slug).catch((error) => {
      console.error('[product] catalog read failed:', error);
      return null;
    }),
    getProductReviewData(slug),
  ]);
  if (!product) notFound();

  // The gallery + buybox live in one client island (ProductExperience) so the
  // gallery image can follow the selected variant (like the price) while
  // sharing a single selection source of truth.
  return <ProductExperience product={product} reviewData={reviewData} />;
}
