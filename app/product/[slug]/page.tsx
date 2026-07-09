import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getProductBySlug } from '@/lib/catalog';
import { ProductClient } from './ProductClient';

// Shopify reads are network calls — don't prerender at build time.
export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Resolve the actual product. Unknown slugs render the 404 boundary instead
  // of silently falling back to a hardcoded item.
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  return (
    <div className="min-h-screen bg-primary-obsidian text-primary-cream">
      <div className="grid grid-cols-1 lg:grid-cols-2">

        {/* Left Hemisphere: Sticky Image Gallery */}
        <div className="relative w-full h-[50vh] lg:h-auto">
          <div className="lg:sticky lg:top-20 flex flex-col gap-1 pb-1 lg:pb-0 h-full lg:h-[calc(100vh-5rem)] overflow-y-auto hide-scrollbar">
            {product.images.map((src, idx) => (
              <div key={idx} className="relative aspect-[3/4] w-full bg-ui-concrete/10 flex-shrink-0">
                <Image
                  src={src}
                  alt={`${product.name} - View ${idx + 1}`}
                  fill
                  priority={idx === 0}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right Hemisphere: Product Info & Actions */}
        <div className="p-8 md:p-12 lg:p-24 flex flex-col justify-center min-h-[50vh] lg:min-h-[calc(100vh-5rem)]">
          <div className="max-w-md w-full mx-auto lg:mx-0">
            <h1 className="text-3xl md:text-5xl font-bold uppercase tracking-tighter mb-4">{product.name}</h1>
            <p className="text-xl font-mono text-ui-concrete mb-12">
              {product.priceMax > product.price
                ? `$${product.price} – $${product.priceMax}`
                : `$${product.price}`}
            </p>

            <p className="text-sm text-ui-concrete leading-relaxed mb-12">
              {product.description}
            </p>

            {/* Interactive Client Component for Size Selection & Cart */}
            <ProductClient product={product} />

            {/* Additional Info — native disclosure widgets (keyboard + touch accessible) */}
            <div className="mt-16 space-y-6 border-t border-ui-concrete/20 pt-8">
              {[
                { title: 'Details & Fabrication', content: '100% Japanese Cotton. 450GSM loopback terry. High-density 3D ink back graphic. Made in Portugal.' },
                { title: 'Shipping & Returns', content: 'Complimentary express shipping on all orders over $200. 14-day return policy.' },
              ].map((section, i) => (
                <details key={i} className="border-b border-ui-concrete/20 pb-6 group">
                  <summary className="uppercase tracking-widest font-bold text-sm cursor-pointer list-none flex items-center justify-between hover:text-accent-energy transition-colors">
                    {section.title}
                    <span className="text-ui-concrete transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="text-sm text-ui-concrete mt-2">{section.content}</p>
                </details>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
