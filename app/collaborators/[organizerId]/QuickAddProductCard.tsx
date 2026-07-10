'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useCart } from '@/store/use-cart';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { MerchItem } from '@/lib/types';

export function QuickAddProductCard({ product }: { product: MerchItem }) {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const { addItem } = useCart();

  const handleSizeSelect = (size: string) => {
    // Phase 4: organizer merch (MerchItem) has no Shopify ProductVariant GID
    // yet — it is mock data until organizers move to Shopify Metaobjects. The
    // store's addItem rejects gracefully when `merchandiseId` is absent (shows
    // an "not available for online checkout yet" error in the bag), so this is
    // non-crashing today. Wiring QuickAdd to a real Shopify variant GID is the
    // Phase 4 organizer-integration task.
    addItem({
      name: product.name,
      price: product.price,
      size,
      image: product.image,
    });
    setIsQuickAddOpen(false);
  };

  return (
    <div className="relative group bg-primary-cream">
      {/* Product Visual */}
      <button
        type="button"
        aria-label={`Quick add ${product.name}`}
        aria-expanded={isQuickAddOpen}
        className="relative block w-full aspect-[3/4] bg-ui-concrete/10 overflow-hidden cursor-pointer"
        onClick={() => setIsQuickAddOpen(true)}
      >
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Quick Add Trigger Overlay */}
        <div className="absolute inset-0 bg-primary-obsidian/0 group-hover:bg-primary-obsidian/20 transition-colors duration-300 flex items-center justify-center">
          <div className="bg-primary-cream text-primary-obsidian px-6 py-3 uppercase tracking-widest font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-4 group-hover:translate-y-0">
            Quick Add
          </div>
        </div>
      </button>

      {/* Product Info */}
      <div className="p-4 bg-primary-cream flex justify-between items-start text-primary-obsidian">
        <h3 className="font-bold uppercase tracking-wider text-sm max-w-[70%] leading-tight">
          {product.name}
        </h3>
        <span className="font-mono">${product.price}</span>
      </div>

      {/* Quick Add Modal (Absolute positioned over the card) */}
      <AnimatePresence>
        {isQuickAddOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute inset-0 z-30 bg-primary-obsidian/95 backdrop-blur-md p-6 flex flex-col"
          >
            <div className="flex justify-between items-center mb-8 text-primary-cream">
              <span className="uppercase tracking-widest font-bold text-sm">Select Size</span>
              <button type="button" onClick={() => setIsQuickAddOpen(false)} aria-label="Close quick add" className="text-ui-concrete hover:text-primary-cream transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 flex-1 content-start">
              {product.sizes.map((size: string) => (
                <button
                  type="button"
                  key={size}
                  onClick={() => handleSizeSelect(size)}
                  className="border border-ui-concrete/30 py-3 text-primary-cream uppercase tracking-widest font-bold hover:border-primary-cream hover:bg-primary-cream hover:text-primary-obsidian transition-colors"
                >
                  {size}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
