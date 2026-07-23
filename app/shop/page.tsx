import { getAllProducts } from '@/lib/catalog';
import { ProductCard } from '@/components/ProductCard';

// Shopify reads are network calls — never statically prerendered.
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Shop page — the single product grid for the storefront.
//
// The client currently runs one collection, so this replaces the two-level
// /collection → /collection/[handle] browse in the nav + footer. It shows
// EVERY product in the store (decoupled from collections via getAllProducts)
// so the grid stays complete even as products are added/removed.
//
// Theme + grid mirror app/collection/[handle]/page.tsx so the cards render
// identically across both surfaces (the card itself is the shared
// components/ProductCard). The /collection routes stay on disk, reachable by
// direct URL, for re-enabling when more collections exist.
// ---------------------------------------------------------------------------

export default async function ShopPage() {
  const products = await getAllProducts();

  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header — left-aligned at the theme boundary on every viewport
            (items-start on mobile's column direction: items-end would pin it
            to the RIGHT edge; md:items-end keeps desktop baseline alignment
            for when the Filter/Sort controls return). */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 border-b border-ui-concrete/20 pb-8 pt-8">
          <div>
            <h1 className="font-inter text-4xl md:text-5xl font-medium uppercase tracking-tighter mb-4">
              Shop
            </h1>
            <p className="text-sm text-ui-concrete max-w-xl leading-relaxed">
              The full collection. Every piece, all in one place.
            </p>
          </div>
          {/* Filter / Sort controls — hidden until they are wired to real
              behavior. They were plain <button>s with no handler (dead UI that
              shoppers could click with zero effect). Re-enable with real
              filtering/sorting logic:
          <div className="mt-8 md:mt-0 flex gap-4 text-sm font-bold uppercase tracking-widest">
            <button type="button" className="hover:text-apeiron-ivory text-ui-concrete transition-colors">
              Filter
            </button>
            <span className="text-ui-concrete/50">/</span>
            <button type="button" className="hover:text-apeiron-ivory text-ui-concrete transition-colors">
              Sort
            </button>
          </div>
          */}
        </div>

        {/* Product Grid */}
        {products.length === 0 ? (
          <p className="text-ui-concrete uppercase tracking-widest text-sm py-24 text-center">
            No products available yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12 mb-16">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
