// ---------------------------------------------------------------------------
// Raw Shopify Storefront API GraphQL response shapes.
//
// These types mirror the exact field selections in lib/shopify/queries.ts.
// They are the raw Shopify shape — NOT the domain types in lib/types.ts.
// The adapter (lib/shopify/adapter.ts) bridges between these two layers.
//
// Do not import these from client components. They are server-only by virtue
// of only being imported by lib/shopify/adapter.ts and lib/catalog.ts.
// ---------------------------------------------------------------------------

/** Shopify's Decimal scalar comes over the wire as a string, e.g. "50.0". */
export interface ShopifyMoneyV2 {
  amount: string;
  currencyCode: string;
}

/** A name/value pair, e.g. { name: "Size", value: "M" } or { name: "Title", value: "Default Title" }. */
export interface ShopifySelectedOption {
  name: string;
  value: string;
}

/** Shopify image object. altText is nullable — many products don't set it. */
export interface ShopifyImage {
  url: string;
  altText: string | null;
}

/** A single product variant (one size/option combination). */
export interface ShopifyProductVariant {
  id: string;
  availableForSale: boolean;
  selectedOptions: ShopifySelectedOption[];
  price: ShopifyMoneyV2;
}

/** Min/max price range across all variants of a product. */
export interface ShopifyProductPriceRange {
  minVariantPrice: ShopifyMoneyV2;
  maxVariantPrice: ShopifyMoneyV2;
}

/**
 * A single product node as returned by the Storefront API.
 * `images` is optional — only present on the PRODUCT_BY_HANDLE_QUERY (detail
 * page). Collection product cards (COLLECTION_BY_HANDLE_QUERY) return
 * `featuredImage` only, via the shared fragment.
 */
export interface ShopifyProductNode {
  id: string;
  handle: string;
  title: string;
  description: string;
  featuredImage: ShopifyImage | null;
  images?: { nodes: ShopifyImage[] };
  variants: { nodes: ShopifyProductVariant[] };
  priceRange: ShopifyProductPriceRange;
}

/** A Shopify Collection (category) node. */
export interface ShopifyCollectionNode {
  handle: string;
  title: string;
  description: string;
  image: ShopifyImage | null;
  products: { nodes: ShopifyProductNode[] };
}

/** Response shape for the `collections(first:)` query (COLLECTION_LIST_QUERY). */
export interface ShopifyCollectionsResponse {
  collections: { nodes: ShopifyCollectionNode[] };
}

/** Response shape for the `collectionByHandle(handle:)` query (COLLECTION_BY_HANDLE_QUERY). */
export interface ShopifyCollectionByHandleResponse {
  collectionByHandle: ShopifyCollectionNode | null;
}

/** Response shape for the `product(handle:)` query (PRODUCT_BY_HANDLE_QUERY). */
export interface ShopifyProductByHandleResponse {
  product: ShopifyProductNode | null;
}