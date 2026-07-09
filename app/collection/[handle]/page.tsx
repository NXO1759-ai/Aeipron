import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCollectionByHandle } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const collection = await getCollectionByHandle(handle);
  if (!collection) notFound();

  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-ui-concrete/20 pb-8 pt-8">
          <div>
            <h1 className="font-inter text-4xl md:text-5xl font-medium uppercase tracking-tighter mb-4">
              {collection.name}
            </h1>
            {collection.description && (
              <p className="text-sm text-ui-concrete max-w-xl leading-relaxed">
                {collection.description}
              </p>
            )}
          </div>
          <div className="mt-8 md:mt-0 flex gap-4 text-sm font-bold uppercase tracking-widest">
            <Link href="/collection" className="hover:text-apeiron-ivory text-ui-concrete transition-colors">
              ← All
            </Link>
            <span className="text-ui-concrete/50">/</span>
            <button type="button" className="hover:text-apeiron-ivory text-ui-concrete transition-colors">Filter</button>
            <span className="text-ui-concrete/50">/</span>
            <button type="button" className="hover:text-apeiron-ivory text-ui-concrete transition-colors">Sort</button>
          </div>
        </div>

        {/* Product Grid */}
        {collection.products.length === 0 ? (
          <p className="text-ui-concrete uppercase tracking-widest text-sm py-24 text-center">
            No products in this collection yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12 mb-16">
            {collection.products.map((product) => (
              <Link href={`/product/${product.id}`} key={product.id} className="group cursor-pointer">
                <div className="relative aspect-[3/4] bg-ui-concrete/10 mb-4 overflow-hidden">
                  {product.images[0] && (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-105 filter grayscale contrast-125"
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}