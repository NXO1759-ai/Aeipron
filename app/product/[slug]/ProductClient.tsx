'use client';

import { useState } from 'react';
import { useCart } from '@/store/use-cart';
import type { Product, ProductOption } from '@/lib/types';

export function ProductClient({ product }: { product: Product }) {
  // One selection per option group, keyed by option name (e.g. "Size", "Color").
  const [selections, setSelections] = useState<Record<string, string>>({});
  const { addItem } = useCart();

  // The selected variant is the first variant matching ALL selected option values.
  const selectedVariantId = (() => {
    const optionNames = product.options.map((o) => o.name);
    if (optionNames.length === 0 || !optionNames.every((n) => selections[n])) return null;

    for (const group of product.options) {
      const selected = group.values.find((v) => v.value === selections[group.name]);
      if (!selected || !selected.inStock) return null;
    }

    // Find the first in-stock value from the first group — for single-dimension
    // products this is the variant GID. For multi-dimension we'd need a matrix
    // lookup, but v1's catalog is single-dimension (Size OR Color, not both).
    return product.options[0]?.values.find((v) => v.value === selections[product.options[0].name])?.variantId ?? null;
  })();

  const handleAddToCart = () => {
    if (!selectedVariantId) return;
    // For Phase 1, still pass the mock-cart shape (Phase 2 will switch to variantId).
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      size: Object.values(selections).join(' / '),
      image: product.images[0],
    });
  };

  return (
    <div>
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