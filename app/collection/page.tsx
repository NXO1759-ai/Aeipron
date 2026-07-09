import Image from 'next/image';
import Link from 'next/link';
import { getCollections } from '@/lib/catalog';

// Shopify reads are network calls — don't prerender at build time.
export const dynamic = 'force-dynamic';

export default async function CollectionPage() {
  const collections = await getCollections();

  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 border-b border-ui-concrete/20 pb-8 pt-8">
          <div>
            <h1 className="font-inter text-4xl md:text-5xl font-medium uppercase tracking-tighter mb-4">Collection</h1>
          </div>
          <div className="mt-8 md:mt-0 flex gap-4 text-sm font-bold uppercase tracking-widest">
            <button type="button" className="hover:text-apeiron-ivory text-ui-concrete transition-colors">Filter</button>
            <span className="text-ui-concrete/50">/</span>
            <button type="button" className="hover:text-apeiron-ivory text-ui-concrete transition-colors">Sort</button>
          </div>
        </div>

        {/* Collections Grid */}
        {collections.length === 0 ? (
          <p className="text-ui-concrete uppercase tracking-widest text-sm py-24 text-center">Collections coming soon.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12 mb-16">
            {collections.map((collection) => (
              <Link href={`/collection/${collection.id}`} key={collection.id} className="group cursor-pointer">
                <div className="relative aspect-[3/4] bg-ui-concrete/10 mb-4 overflow-hidden">
                  {collection.image ? (
                    <Image
                      src={collection.image}
                      alt={collection.name}
                      fill
                      className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-inter text-2xl md:text-3xl font-medium uppercase tracking-tighter text-ui-concrete/30 select-none">
                        {collection.name}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-apeiron-black/0 group-hover:bg-apeiron-black/20 transition-colors duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]" />
                </div>
                <div className="flex justify-between items-start mt-4">
                  <h3 className="font-bold uppercase tracking-wider text-sm leading-tight max-w-[75%] text-ui-concrete group-hover:text-apeiron-ivory transition-colors duration-300">
                    {collection.name}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}