'use client';

import { useState } from 'react';
import { useCart } from '@/store/use-cart';
import type { Product, SizeOption } from '@/lib/types';

export function ProductClient({ product }: { product: Product }) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const { addItem } = useCart();

  const handleAddToCart = () => {
    if (!selectedSize) return;
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      size: selectedSize,
      image: product.images[0],
    });
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-end">
        <span className="uppercase tracking-widest text-sm font-bold">Select Size</span>
        <button type="button" className="text-ui-concrete hover:text-primary-cream underline-offset-4 hover:underline text-xs tracking-widest uppercase transition-all">Size Guide</button>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-10">
        {product.sizes.map((s: SizeOption) => (
          <button
            type="button"
            key={s.size}
            disabled={!s.inStock}
            aria-pressed={selectedSize === s.size}
            aria-label={`Size ${s.size}${!s.inStock ? ', out of stock' : ''}`}
            onClick={() => setSelectedSize(s.size)}
            className={`
              py-3 text-sm font-bold uppercase tracking-widest transition-colors relative
              ${!s.inStock ? 'text-ui-concrete border-ui-concrete/30 cursor-not-allowed bg-transparent' : 'cursor-pointer'}
              ${s.inStock && selectedSize !== s.size ? 'border-primary-cream/50 text-primary-cream hover:bg-primary-cream/10 border' : ''}
              ${selectedSize === s.size ? 'bg-primary-cream text-primary-obsidian border border-primary-cream' : ''}
              ${!s.inStock ? 'border border-ui-concrete/30 overflow-hidden' : ''}
            `}
          >
            {s.size}
            {!s.inStock && (
              <span className="absolute top-1/2 left-0 w-full h-[1px] bg-ui-concrete/50 transform -translate-y-1/2 -rotate-45" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={!selectedSize}
        className={`w-full py-5 uppercase tracking-widest font-bold transition-colors ${
          selectedSize
            ? 'bg-apeiron-ivory text-apeiron-black hover:opacity-80 cursor-pointer'
            : 'bg-ui-concrete/20 text-ui-concrete cursor-not-allowed'
        }`}
      >
        {selectedSize ? 'Add to bag' : 'Select a size'}
      </button>
    </div>
  );
}
