'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useCart } from '@/store/use-cart';
import { resolveSelectedVariant } from '@/lib/product';
import { RichText } from '@/components/RichText';
import type { Product, ProductOption } from '@/lib/types';

// ---------------------------------------------------------------------------
// ProductExperience — the interactive product detail (client island).
//
// Owns the per-option-group selection state and renders BOTH the gallery
// (left) and the buybox (right) so they share one source of truth. The gallery's
// active image follows the selected variant — exactly like the price — and
// falls back to the first product image (or a placeholder) when no variant is
// selected or the variant has no image.
//
// The selection → variant → image/price/merchandiseId chain is pure
// (`resolveSelectedVariant`), so the gallery and the buybox can never disagree.
//
// Hydration: initial render uses an empty selection → active image is
// `product.images[0]`, which matches the server render (no mismatch). The
// quantity stepper / add-to-bag reuse the Phase 2 cart store verbatim.
// ---------------------------------------------------------------------------

export function ProductExperience({ product }: { product: Product }) {
  // One selection per option group, keyed by option name (e.g. "Size", "Color").
  const [selections, setSelections] = useState<Record<string, string>>({});
  // A manually-browsed thumbnail index, or null when the variant drives the image.
  // Selecting an option value resets this so the variant image always takes over.
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const { addItem } = useCart();

  const selectedVariant = resolveSelectedVariant(product, selections);
  const selectedVariantId = selectedVariant?.variantId ?? null;
  const selectedVariantPrice = selectedVariant?.price ?? null;

  // Active image: a manually-browsed thumbnail wins, then the selected variant's
  // image, then the first product image. '' only when the product has no images
  // AND the variant has none — the gallery renders a placeholder then.
  const activeImage =
    manualIndex != null
      ? product.images[manualIndex] ?? ''
      : selectedVariant?.image || product.images[0] || '';

  const handleAddToCart = async () => {
    if (!selectedVariantId) return;
    // The browser never sends a price — `price` here is display-only (the
    // optimistic line in the cart cache) and uses the SELECTED variant's price.
    await addItem({
      merchandiseId: selectedVariantId,
      name: product.name,
      price: selectedVariantPrice ?? product.price,
      size: Object.values(selections).join(' / '),
      image: selectedVariant?.image || product.images[0] || '',
      currencyCode: 'USD',
    });
  };

  // Selecting an option value resets manual browsing so the variant image wins.
  const selectOption = (name: string, value: string) => {
    setSelections((prev) => ({ ...prev, [name]: value }));
    setManualIndex(null);
  };

  // Price shown live: the selected variant's price once a valid in-stock
  // selection is made, otherwise the product's min–max range (or single price).
  const priceLabel =
    selectedVariantPrice != null
      ? `$${selectedVariantPrice}`
      : product.priceMax > product.price
        ? `$${product.price} – $${product.priceMax}`
        : `$${product.price}`;

  return (
    <div className="min-h-screen bg-primary-obsidian text-primary-cream">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: gallery (main image + thumbnails) */}
        <div className="relative w-full">
          <div className="lg:sticky lg:top-24 flex flex-col-reverse lg:flex-row-reverse gap-3 lg:gap-4 px-4 lg:px-8 pb-4 lg:pb-0 h-[60vh] lg:h-[calc(100vh-6rem)]">
            {/* Main image — follows the selected variant */}
            <div className="relative flex-1 min-h-[40vh] lg:min-h-0 aspect-[3/4] lg:aspect-auto bg-ui-concrete/10">
              {activeImage ? (
                <Image
                  key={activeImage}
                  src={activeImage}
                  alt={`${product.name}`}
                  fill
                  priority
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-ui-concrete/40 text-sm uppercase tracking-widest">
                  No image
                </div>
              )}
            </div>

            {/* Thumbnails — browse manually; variant selection resets to the variant image */}
            {product.images.length > 1 ? (
              <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden hide-scrollbar lg:w-20 shrink-0">
                {product.images.map((src, idx) => {
                  const isActive = src === activeImage;
                  return (
                    <button
                      type="button"
                      key={`${src}-${idx}`}
                      onClick={() => setManualIndex(idx)}
                      aria-label={`View image ${idx + 1}`}
                      aria-pressed={isActive}
                      className={`relative shrink-0 w-16 h-20 lg:w-20 lg:h-24 bg-ui-concrete/10 overflow-hidden border transition-colors ${
                        isActive ? 'border-primary-cream' : 'border-transparent hover:border-ui-concrete/40'
                      }`}
                    >
                      <Image src={src} alt={`${product.name} - View ${idx + 1}`} fill className="object-cover" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: product info & actions */}
        <div className="p-8 md:p-12 lg:p-24 flex flex-col justify-center min-h-[50vh] lg:min-h-[calc(100vh-5rem)]">
          <div className="max-w-md w-full mx-auto lg:mx-0">
            <h1 className="text-3xl md:text-5xl font-bold uppercase tracking-tighter mb-4">{product.name}</h1>

            {/* Price updates with the selected variant (live). */}
            <p className="text-xl font-mono text-ui-concrete mb-12" aria-live="polite">
              {priceLabel}
            </p>

            <p className="text-sm text-ui-concrete leading-relaxed mb-12">{product.description}</p>

            {product.options.map((group: ProductOption) => (
              <div key={group.name} className="mb-10">
                <div className="mb-6 flex justify-between items-end">
                  <span className="uppercase tracking-widest text-sm font-bold">Select {group.name}</span>
                  {/* Size Guide button — commented out per client direction.
                      Kept here (not deleted) so it can be re-wired to a size
                      chart later. Re-enable by uncommenting the JSX below.
                  <button
                    type="button"
                    className="text-ui-concrete hover:text-primary-cream underline-offset-4 hover:underline text-xs tracking-widest uppercase transition-all"
                  >
                    {group.name} Guide
                  </button>
                  */}
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
                        onClick={() => selectOption(group.name, v.value)}
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
                          <span
                            className="absolute top-1/2 left-0 w-full h-[1px] bg-ui-concrete/50 transform -translate-y-1/2 -rotate-45"
                            aria-hidden="true"
                          />
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

            {/* Additional Info — native disclosure widgets (keyboard + touch
                accessible), driven by Shopify `rich_text` metafields. A section
                renders only when its metafield has content (undefined when the
                product doesn't have it set, or its definition isn't exposed to
                the Storefront API). Shipping & Returns was removed per client
                direction. The metafield value is a `rich_text` JSON string
                rendered by <RichText> (NOT HTML — see components/RichText). */}
            <div className="mt-16 space-y-6 border-t border-ui-concrete/20 pt-8">
              {[
                { title: 'Details & Fabrication', value: product.detailsFabrication },
                { title: 'Product Care', value: product.productCare },
                { title: 'Product Sizing', value: product.productSizing },
              ]
                .filter((section) => section.value)
                .map((section) => (
                  <details key={section.title} className="border-b border-ui-concrete/20 pb-6 group">
                    <summary className="uppercase tracking-widest font-bold text-sm cursor-pointer list-none flex items-center justify-between hover:text-accent-energy transition-colors">
                      {section.title}
                      <span className="text-ui-concrete transition-transform group-open:rotate-45" aria-hidden="true">
                        +
                      </span>
                    </summary>
                    <div className="text-sm text-ui-concrete mt-2 space-y-2">
                      <RichText value={section.value} />
                    </div>
                  </details>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}