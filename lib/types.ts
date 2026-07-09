// Shared domain types. Kept framework-agnostic so they can be imported by
// server components, server actions, and client components alike.

/**
 * A single selectable value within a product option group (e.g. "Red", "Small").
 * `inStock` is sourced from the Shopify variant's `availableForSale`. `price` is
 * the variant's own price (parsed from Shopify's Decimal string) so the UI can
 * show a per-selection price; it is display-only — the server/Shopify is the
 * source of truth at checkout.
 */
export interface ProductOptionValue {
  value: string;
  inStock: boolean;
  price: number;
  variantId: string; // Shopify ProductVariant GID — needed by the cart (Phase 2)
}

/**
 * An option group on a product (e.g. { name: "Size", values: [...] }). A product
 * with a single option dimension has one group; multi-dimension products (e.g.
 * Size × Color) have one group per dimension. Grouped here so the selector can
 * render one picker per group, labeled by `name`.
 */
export interface ProductOption {
  name: string;
  values: ProductOptionValue[];
}

export interface Product {
  id: string; // Shopify handle — used as the /product/[slug] route param
  name: string;
  price: number; // minVariantPrice — display fallback / single-price products
  priceMax: number; // maxVariantPrice — equals `price` when all variants share one price
  description: string;
  images: string[];
  options: ProductOption[];
}

export interface MerchItem {
  id: string;
  name: string;
  price: number;
  image: string;
  sizes: string[];
}

export interface Organizer {
  id: string;
  name: string;
  image: string;
  heroImage: string;
  merch: MerchItem[];
}

/** A Shopify Collection (category) as rendered on the collections index. */
export interface CollectionSummary {
  id: string; // Shopify collection handle — used as the /collection/[handle] route param
  name: string; // collection title
  description: string;
  image: string; // collection image, falling back to a product's featuredImage
}

/** A Shopify Collection with its products expanded. */
export interface Collection extends CollectionSummary {
  products: Product[];
}

// What the client is allowed to send to the server when checking out.
// Note the deliberate absence of `price` — the server prices the cart.
export interface CartLine {
  id: string;
  size: string;
  quantity: number;
}