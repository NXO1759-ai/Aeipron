// ---------------------------------------------------------------------------
// Pure helpers for product / variant selection.
//
// `resolveSelectedVariant` turns a product + a per-option-group selection map
// into the single selected `ProductVariant` from the full matrix
// (`Product.variants`). Keeping this pure and out of the React component makes
// it unit-testable and lets the product page derive BOTH the cart
// `merchandiseId` (the variant GID) and the live-updating display price + gallery
// image from one source of truth.
//
// The match is against the variant matrix, NOT the per-value option aggregates:
// each variant carries its full `selectedOptions` combination (e.g. Color=Black
// + Size=large), so a multi-dimension selection resolves to the ONE variant
// matching every group. The per-value `ProductOptionValue` aggregates cannot
// represent a specific combination — that is why variant identity lives in the
// matrix and is resolved here.
// ---------------------------------------------------------------------------

import type { Product, ProductVariant } from '@/lib/types';

/**
 * Resolve the currently-selected variant from a product and a per-option
 * selection map (option name → selected value).
 *
 * Returns `null` until EVERY option group has a selection. It then finds the
 * single variant whose `selectedOptions` match the selected value in every
 * group, and returns `null` when that exact variant is out of stock
 * (`availableForSale: false`) — an out-of-stock combination is never added to
 * the cart, even when each selected value shows as in stock at the per-value
 * aggregate level (which can happen on multi-dimension products). Returns
 * `null` for a product with no option groups.
 *
 * The returned `ProductVariant` carries `id` (the ProductVariant GID used to
 * create a cart line), `price` (the variant's own price, for live UI display),
 * and `image` (the variant's image, for the gallery switch).
 */
export function resolveSelectedVariant(
  product: Product,
  selections: Record<string, string>,
): ProductVariant | null {
  const optionNames = product.options.map((o) => o.name);
  if (optionNames.length === 0 || !optionNames.every((name) => selections[name])) {
    return null;
  }

  // Find the exact variant whose selectedOptions match the buyer's per-group
  // selection. Each variant carries the full combination, so a multi-dimension
  // selection (Color=Black + Size=large) resolves to one variant, not the
  // first/cheapest value of the first group.
  const selected = product.variants.find((variant) =>
    optionNames.every((name) => {
      const opt = variant.selectedOptions.find((o) => o.name === name);
      return opt?.value === selections[name];
    }),
  );

  // An out-of-stock combination resolves to null — never added to the cart.
  // This checks the SPECIFIC variant's availability, not the per-value aggregate
  // (which can be in stock for a value while the cross-dimension combo is not).
  if (!selected || !selected.availableForSale) return null;

  return selected;
}