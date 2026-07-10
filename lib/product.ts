// ---------------------------------------------------------------------------
// Pure helpers for product / variant selection.
//
// `resolveSelectedVariant` turns a product + a per-option-group selection map
// into the single selected `ProductOptionValue` (which carries the Shopify
// ProductVariant GID + the variant's own price). Keeping this pure and out of
// the React component makes it unit-testable and lets the product page derive
// BOTH the cart `merchandiseId` and the live-updating display price from one
// source of truth.
//
// v1 catalog note: products are single-dimension (one option group — Size OR
// Color, not both), so the selected value from the first group IS the variant.
// A multi-dimension matrix lookup is a later concern.
// ---------------------------------------------------------------------------

import type { Product, ProductOptionValue } from '@/lib/types';

/**
 * Resolve the currently-selected variant from a product and a per-option
 * selection map (option name → selected value).
 *
 * Returns `null` until EVERY option group has a selection, and only resolves
 * when the selected value in every group is in stock. The returned
 * `ProductOptionValue` carries `variantId` (the ProductVariant GID used to
 * create a cart line) and `price` (the variant's own price, for live UI
 * display). Returns `null` for a product with no option groups.
 */
export function resolveSelectedVariant(
  product: Product,
  selections: Record<string, string>,
): ProductOptionValue | null {
  const optionNames = product.options.map((o) => o.name);
  if (optionNames.length === 0 || !optionNames.every((name) => selections[name])) {
    return null;
  }

  // Every selected value must be in stock — a partial/invalid selection
  // resolves to nothing (the UI shows "Select an option" and no live price).
  for (const group of product.options) {
    const selected = group.values.find((v) => v.value === selections[group.name]);
    if (!selected || !selected.inStock) return null;
  }

  // v1: single-dimension — the first group's selected value IS the variant.
  return product.options[0]?.values.find((v) => v.value === selections[product.options[0].name]) ?? null;
}