'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { useCart } from '@/store/use-cart';
import { resolveSelectedVariant, resolvePreviewVariant, variantDescriptor } from '@/lib/product';
import { splitOptionValues } from '@/lib/size-selector';
import { isSizeGroup, measurementsForSizes } from '@/lib/size-measurements';
import { RichText } from '@/components/RichText';
import { SizeSelector } from '@/components/SizeSelector';
import { ColorSwatchGroup, isColorGroup } from '@/components/product/ColorSwatch';
import { SmoothDisclosure } from '@/components/product/SmoothDisclosure';
import { ReviewsSection } from '@/components/product/ReviewsSection';
import type { ProductReviewData } from '@/lib/judge-me';
import type { Product, ProductOption } from '@/lib/types';

/** Shown inside a disclosure when its metafield has no value yet — the store
 * hasn't filled it in (or the definition isn't exposed to the Storefront API).
 * The section still renders so the page structure is stable across products. */
const NO_CONTENT_MESSAGE = 'No content available yet.';

// ---------------------------------------------------------------------------
// ProductExperience — the interactive product detail (client island).
//
// Owns the per-option-group selection state and renders BOTH the gallery
// (left) and the buybox (right) so they share one source of truth. The gallery's
// active image follows the PARTIAL selection via `resolvePreviewVariant` (it
// reacts to the first color pick, before every group is chosen), while the
// price + cart merchandiseId use `resolveSelectedVariant` (the exact, in-stock
// variant — needs every group selected). Both fall back to the first product
// image (or a placeholder) when nothing is selected or no image is available.
//
// The selection → preview/selected variant → image/price/merchandiseId chain is
// pure, so the gallery and the buybox can never disagree.
//
// Hydration: initial render uses an empty selection → active image is
// `product.images[0]`, which matches the server render (no mismatch). The
// quantity stepper / add-to-bag reuse the Phase 2 cart store verbatim.
// ---------------------------------------------------------------------------

export function ProductExperience({ product, reviewData }: { product: Product; reviewData: ProductReviewData }) {
  // One selection per option group, keyed by option name (e.g. "Size", "Color").
  const [selections, setSelections] = useState<Record<string, string>>({});
  // A manually-browsed thumbnail index, or null when the variant drives the image.
  // Selecting an option value resets this so the variant image always takes over.
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const { addItem } = useCart();

  const selectedVariant = resolveSelectedVariant(product, selections);
  const selectedVariantId = selectedVariant?.id ?? null;
  const selectedVariantPrice = selectedVariant?.price ?? null;
  // Preview variant for the gallery: matches the PARTIAL selection (wildcards
  // on unselected groups, ignores availability) so the image reacts to the
  // first color pick — without waiting for every group to be selected (which
  // the cart-add resolver requires). Null only when nothing is selected.
  const previewVariant = resolvePreviewVariant(product, selections);

  // Active image: a manually-browsed thumbnail wins, then the preview variant's
  // image (reflects the selection so far), then the first product image. '' only
  // when the product has no images AND no variant has one — the gallery renders a
  // placeholder then.
  const activeImage =
    manualIndex != null
      ? product.images[manualIndex] ?? ''
      : previewVariant?.image || product.images[0] || '';

  const handleAddToCart = async () => {
    if (!selectedVariant) return;
    // Variant descriptor shown in the cart: built from the RESOLVED variant's
    // own selectedOptions via the same `variantDescriptor` the adapter uses for
    // mapCartLine — so the optimistic line and the reconciled server line are
    // byte-identical and never flicker. Reading from selectedVariant (not
    // product.options / selections) avoids any cross-variant ordering
    // assumption: the server labels the same variant from the same field.
    const variantLabel = variantDescriptor(selectedVariant.selectedOptions);
    // The browser never sends a price — `price` here is display-only (the
    // optimistic line in the cart cache) and uses the SELECTED variant's price.
    await addItem({
      merchandiseId: selectedVariant.id,
      name: product.name,
      price: selectedVariant.price,
      variantLabel,
      image: selectedVariant.image || product.images[0] || '',
      currencyCode: 'USD',
    });
  };

  // Selecting an option value resets manual browsing so the variant image wins.
  // useCallback'd so it's a stable identity across re-renders — the memoized
  // ColorSwatchGroup / ColorSwatch then only re-render on a real prop change.
  const selectOption = useCallback((name: string, value: string) => {
    setSelections((prev) => ({ ...prev, [name]: value }));
    setManualIndex(null);
  }, []);

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
                  sizes="(min-width: 1024px) 50vw, 100vw"
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
                      <Image
                        src={src}
                        alt={`${product.name} - View ${idx + 1}`}
                        fill
                        sizes="(min-width: 1024px) 80px, 64px"
                        className="object-cover"
                      />
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

            {product.options.map((group: ProductOption) => {
              // The Color group renders as visual color checkpoints (round
              // dots); every other group (Size, etc.) renders as the
              // sliding-marker SizeSelector. Both drive the SAME selections
              // Record + resolveSelectedVariant, so the cart still resolves
              // the exact variant GID.
              if (isColorGroup(group.name)) {
                return (
                  <ColorSwatchGroup
                    key={group.name}
                    group={group}
                    selectedValue={selections[group.name]}
                    onSelect={selectOption}
                  />
                );
              }

              const { sizes, soldOut } = splitOptionValues(group.values);
              // Garment measurements (chest/length) belong to the Size group
              // only, and only when the product carries a valid
              // `custom.size_measurements` metafield — otherwise no readout.
              const measurements =
                product.sizeMeasurements && isSizeGroup(group.name)
                  ? measurementsForSizes(product.sizeMeasurements, sizes)
                  : undefined;

              return (
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

                  {/* Sliding-marker selector (components/SizeSelector): sold-out
                      values are strike-through + aria-disabled and skipped by
                      keyboard nav; picking a value writes into the same
                      `selections` Record the old button row used. Uncontrolled —
                      the selector owns its pill state and reports changes up via
                      onChange, exactly like the demo page. When the product
                      supplies size measurements, the selector renders the
                      "CHEST … · LENGTH …" readout under its ruler track. */}
                  <SizeSelector
                    label={`Select ${group.name}`}
                    sizes={sizes}
                    soldOut={soldOut}
                    defaultSize={selections[group.name]}
                    measurements={measurements}
                    measurementUnit={product.sizeMeasurements?.unit}
                    onChange={(value) => selectOption(group.name, value)}
                  />
                </div>
              );
            })}

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

            {/* Additional Info — animated disclosure rows (SmoothDisclosure:
                compositor-only grid-row transition, like the cart drawer). The
                three rich-text sections are driven by Shopify `rich_text`
                metafields and always render so the structure is stable across
                products; when a metafield has no value yet (null/undefined —
                the store hasn't filled it in, or its definition isn't exposed
                to the Storefront API), the row shows NO_CONTENT_MESSAGE instead
                of disappearing. Shipping & Returns was removed per client
                direction. The metafield value is a `rich_text` JSON string
                rendered by <RichText> (NOT HTML — see components/RichText).
                The fourth row, Reviews, pairs the fit scale (custom.review
                json metafield → product.fit) with the Judge.me review data
                fetched server-side and passed in as props. */}
            <div className="mt-16 space-y-6 border-t border-ui-concrete/20 pt-8">
              {[
                { title: 'Details & Fabrication', value: product.detailsFabrication },
                { title: 'Product Care', value: product.productCare },
                { title: 'Product Sizing', value: product.productSizing },
              ].map((section) => (
                <SmoothDisclosure key={section.title} summary={section.title}>
                  {section.value ? (
                    <div className="space-y-2">
                      <RichText value={section.value} />
                    </div>
                  ) : (
                    <p className="italic">{NO_CONTENT_MESSAGE}</p>
                  )}
                </SmoothDisclosure>
              ))}
              <SmoothDisclosure summary="Reviews">
                <ReviewsSection fit={product.fit ?? 0} data={reviewData} />
              </SmoothDisclosure>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
