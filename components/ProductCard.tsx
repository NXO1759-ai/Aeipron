import Image from 'next/image';
import Link from 'next/link';
import type { Product } from '@/lib/types';

// ---------------------------------------------------------------------------
// ProductCard — the shared product grid card (collection detail + shop pages).
//
// Extracted verbatim from app/collection/[handle]/page.tsx so the collection and
// shop grids can't drift. A Server Component (no 'use client'); it renders a
// next/image fill image in a 3/4 frame with a hover scale + overlay, the product
// name, and a min–max price range (or a single price when they're equal). The
// card links to /product/[slug] via product.id (the Shopify handle).
// ---------------------------------------------------------------------------

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.id}`} className="group cursor-pointer">
      <div className="relative aspect-[3/4] bg-ui-concrete/10 mb-4 overflow-hidden">
        {product.images[0] && (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-apeiron-black/0 group-hover:bg-apeiron-black/20 transition-colors duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]" />
      </div>
      <div className="flex justify-between items-start mt-4">
        <h3 className="font-bold uppercase tracking-wider text-sm leading-tight max-w-[75%] text-ui-concrete group-hover:text-apeiron-ivory transition-colors duration-300">
          {product.name}
        </h3>
        <span className="font-mono text-ui-concrete">
          {product.priceMax > product.price
            ? `$${product.price}–${product.priceMax}`
            : `$${product.price}`}
        </span>
      </div>
    </Link>
  );
}
