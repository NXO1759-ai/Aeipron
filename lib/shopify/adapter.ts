// ---------------------------------------------------------------------------
// Shopify → domain adapter.
//
// Maps raw Shopify GraphQL response nodes (lib/shopify/types.ts) to the
// existing domain types (lib/types.ts). This is the single place where
// Shopify's field names and shapes are translated — when Shopify renames a
// field on an API version bump, only this file changes, not every route.
//
// Key mapping decisions:
//   - Product.id  ← node.handle  (NOT node.id — the route uses handle as the URL slug)
//   - Product.price ← priceRange.minVariantPrice.amount (parsed from string to number)
//   - Product.images ← images?.nodes ?? [featuredImage] (fallback for collection page)
//   - SizeOption.size ← selectedOptions where name === "Size", fallback "OS"
//   - SizeOption.inStock ← variant.availableForSale
//
// Do not import this from a client component — it imports lib/shopify/types
// which carries Shopify's raw shapes and is server-side only.
// ---------------------------------------------------------------------------

import type { Product, SizeOption } from '@/lib/types';
import type { ShopifyProductNode, ShopifyProductVariant } from '@/lib/shopify/types';

/**
 * Map a Shopify product node to the domain Product type.
 *
 * @param node - raw Shopify product from the Storefront API
 * @returns a Product ready for consumption by the UI
 */
export function mapProduct(node: ShopifyProductNode): Product {
  return {
    id: node.handle,
    name: node.title,
    price: Number(node.priceRange.minVariantPrice.amount),
    description: node.description,
    images: mapImages(node),
    sizes: mapSizeOptions(node.variants.nodes),
  };
}

/**
 * Extract the image URL list from a Shopify product node.
 *
 * The detail query (PRODUCT_BY_HANDLE_QUERY) returns `images(first: 10)`.
 * The list query (PRODUCT_LIST_QUERY) returns only `featuredImage`.
 * Fall back to `featuredImage` when `images` is absent so the collection card
 * always has at least one image to render.
 */
function mapImages(node: ShopifyProductNode): string[] {
  if (node.images && node.images.nodes.length > 0) {
    return node.images.nodes.map((img) => img.url);
  }
  if (node.featuredImage) {
    return [node.featuredImage.url];
  }
  return [];
}

/**
 * Collapse Shopify variant nodes into the domain SizeOption shape.
 *
 * Each Shopify variant has `selectedOptions` (e.g. [{ name: "Size", value: "M" }]).
 * We find the option named "Size" and use its value. If no "Size" option exists
 * (e.g. a one-size-fits-all product with only "Default Title"), we use "OS".
 *
 * The `availableForSale` boolean maps directly to `inStock`.
 * Variants are returned in definition order — do not sort.
 */
function mapSizeOptions(variants: ShopifyProductVariant[]): SizeOption[] {
  return variants.map((variant) => {
    const sizeOption = variant.selectedOptions.find(
      (opt) => opt.name === 'Size',
    );
    return {
      size: sizeOption?.value ?? 'OS',
      inStock: variant.availableForSale,
    };
  });
}