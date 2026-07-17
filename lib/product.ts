// ---------------------------------------------------------------------------
// Pure helpers for product / variant selection.
//
// `resolveSelectedVariant` turns a product + a per-option-group selection map
// into the single selected `ProductVariant` from the full matrix
// (`Product.variants`). Keeping this pure and out of the React component makes
// it unit-testable and lets the product page derive BOTH the cart
// `merchandiseId` (the variant GID) and the live-updating display price from one
// source of truth. It requires EVERY group to be selected (the cart add needs
// an exact variant), so the gallery image uses a separate, partial-match
// `resolvePreviewVariant` that follows the selection as it is built (see below).
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
 * Build the cart-display descriptor for a variant from its `selectedOptions`:
 * ALL option VALUES joined in Shopify order (e.g. "Black / large"), skipping a
 * 'Title'-named group (single-variant / "Default Title" products); 'OS' when no
 * real options remain.
 *
 * Shared by the adapter (`mapCartLine`, from the resolved Shopify variant's
 * selectedOptions) and the PDP's optimistic cart line (from the resolved
 * `ProductVariant.selectedOptions`) so the two produce BYTE-IDENTICAL labels
 * and never flicker when the store reconciles with Shopify's response. Both
 * sides read from the SAME shape (the variant's own selectedOptions, in the
 * order Shopify returns them) — not from a proxy like `product.options` — so
 * the match does not depend on cross-variant ordering staying consistent.
 */
export function variantDescriptor(
  selectedOptions: { name: string; value: string }[],
): string {
  const parts = selectedOptions
    .filter((o) => o.name !== 'Title')
    .map((o) => o.value);
  return parts.length > 0 ? parts.join(' / ') : 'OS';
}

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

/**
 * Resolve a PREVIEW variant for the gallery image from a PARTIAL per-group
 * selection.
 *
 * Unlike `resolveSelectedVariant`, this does NOT require every group to be
 * selected: it matches the first variant whose `selectedOptions` agree on every
 * group that HAS a selection (unselected groups are wildcards), and it ignores
 * availability — the gallery should show the selected color's image even when
 * the exact size combination is out of stock.
 *
 * This exists because the cart-add resolver is all-or-nothing: on a Color ×
 * Size product, selecting only Color leaves `resolveSelectedVariant` null, so
 * the gallery would stay on `product.images[0]` until a Size is also picked —
 * the image would not react to the first color selection. The preview resolver
 * fixes that by reflecting whatever is selected so far.
 *
 * Returns `null` only when nothing is selected (the gallery then falls back to
 * `product.images[0]`, matching the server render — no hydration mismatch). Used
 * for the gallery image ONLY; the cart add + live price still use
 * `resolveSelectedVariant` (which needs the exact, in-stock variant).
 */
export function resolvePreviewVariant(
  product: Product,
  selections: Record<string, string>,
): ProductVariant | null {
  const selectedNames = product.options
    .map((o) => o.name)
    .filter((name) => selections[name]);
  if (selectedNames.length === 0) return null;

  return (
    product.variants.find((variant) =>
      selectedNames.every((name) => {
        const opt = variant.selectedOptions.find((o) => o.name === name);
        return opt?.value === selections[name];
      }),
    ) ?? null
  );
}
