'use client';

import { useState } from 'react';
import { useCart } from '@/store/use-cart';
import { resolveSelectedVariant } from '@/lib/product';
import type { Product, ProductOption } from '@/lib/types';

export function ProductClient({ product }: { product: Product }) {
  // One selection per option group, keyed by option name (e.g. "Size", "Color").
  const [selections, setSelections] = useState<Record<string, string>>({});
  const { addItem } = useCart();

  // The selected variant: resolves once ALL groups have an in-stock selection.
  // `variantId` is the Shopify ProductVariant GID (the cart merchandiseId);
  // `price` is the variant's own price, shown live as the selection changes.
  const selectedVariant = resolveSelectedVariant(product, selections);
  const selectedVariantId = selectedVariant?.variantId ?? null;
  const selectedVariantPrice = selectedVariant?.price ?? null;

  const handleAddToCart = async () => {
    if (!selectedVariantId) return;
    // Phase 2: pass the resolved Shopify ProductVariant GID as `merchandiseId`.
    // The server action creates/adds the Shopify cart line from it; the browser
    // never sends a price (Shopify prices the line from the variant). The
    // `price` passed here is display-only (provisional line in the optimistic
    // cache) and uses the SELECTED variant's price, not the product minimum.
    await addItem({
      merchandiseId: selectedVariantId,
      name: product.name,
      price: selectedVariantPrice ?? product.price,
      size: Object.values(selections).join(' / '),
      image: product.images[0] ?? '',
      currencyCode: 'USD',
    });
  };

  // Price shown live: the selected variant's price once a valid in-stock
  // selection is made, otherwise the product's min–max range (or single price).
  const priceLabel = selectedVariantPrice != null
    ? `$${selectedVariantPrice}`
    : product.priceMax > product.price
      ? `$${product.price} – $${product.priceMax}`
      : `$${product.price}`;

  return (
    <div>
      {/* Price updates with the selected variant (live). */}
      <p className="text-xl font-mono text-ui-concrete mb-12" aria-live="polite">
        {priceLabel}
      </p>

      <p className="text-sm text-ui-concrete leading-relaxed mb-12">
        {product.description}
      </p>

      {product.options.map((group: ProductOption) => (
        <div key={group.name} className="mb-10">
          <div className="mb-6 flex justify-between items-end">
            <span className="uppercase tracking-widest text-sm font-bold">Select {group.name}</span>
            <button type="button" className="text-ui-concrete hover:text-primary-cream underline-offset-4 hover:underline text-xs tracking-widest uppercase transition-all">{group.name} Guide</button>
          </div>

          <div className="flex flex-wrap gap-3">
            {group.values.map((v) => {
              const isSelected = selections[group.name] === v.value;
              return (
                <button
                  type="button"
                  key={v.value}
                  disabled={!v.inStock}
                  aria-pressed={isSelected}
                  aria-label={`${group.name} ${v.value}${!v.inStock ? ', out of stock' : ''}`}
                  onClick={() => setSelections((prev) => ({ ...prev, [group.name]: v.value }))}
                  className={`
                    min-w-[3.5rem] px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors relative
                    ${!v.inStock ? 'text-ui-concrete border-ui-concrete/30 cursor-not-allowed bg-transparent' : 'cursor-pointer'}
                    ${v.inStock && !isSelected ? 'border-primary-cream/50 text-primary-cream hover:bg-primary-cream/10 border' : ''}
                    ${isSelected ? 'bg-primary-cream text-primary-obsidian border border-primary-cream' : ''}
                    ${!v.inStock ? 'border border-ui-concrete/30 overflow-hidden' : ''}
                  `}
                >
                  {v.value}
                  {!v.inStock && (
                    <span className="absolute top-1/2 left-0 w-full h-[1px] bg-ui-concrete/50 transform -translate-y-1/2 -rotate-45" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={!selectedVariantId}
        className={`w-full py-5 uppercase tracking-widest font-bold transition-colors ${
          selectedVariantId
            ? 'bg-apeiron-ivory text-apeiron-black hover:opacity-80 cursor-pointer'
            : 'bg-ui-concrete/20 text-ui-concrete cursor-not-allowed'
        }`}
      >
        {selectedVariantId ? 'Add to bag' : 'Select an option'}
      </button>
    </div>
  );
}