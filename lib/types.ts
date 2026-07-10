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

// ---------------------------------------------------------------------------
// Cart domain types (Phase 2).
//
// These mirror the Shopify Cart API response, adapted by lib/shopify/adapter.ts
// (mapCart / mapCartLine). The browser never sends a price — cart mutations
// send only `merchandiseId` + `quantity` (and `lineId`/`cartId`). The `price` on
// CartLine is display-only, sourced from Shopify's `cost.amountPerQuantity`.
// ---------------------------------------------------------------------------

/**
 * A single line in a Shopify cart, as held in the Zustand optimistic cache and
 * rendered in the cart drawer / checkout summary.
 *
 * Identity: `lineId` is the Shopify CART-LINE GID (distinct from the variant
 * GID). It is the stable, unique key `cartLinesUpdate` / `cartLinesRemove`
 * require, and the React key for line rendering. `merchandiseId` is the
 * ProductVariant GID, used only to CREATE a line.
 *
 * `price` is display-only and parsed from Shopify's `cost.amountPerQuantity`
 * (a Decimal string → number). The server/Shopify is the price source of truth
 * — the client never sends a price.
 */
export interface CartLine {
  lineId: string; // Shopify cart-line GID — unique key for updates/removal/React
  merchandiseId: string; // Shopify ProductVariant GID — used to create a line
  name: string; // display name (product title, optionally with size)
  price: number; // display-only, from Shopify cost.amountPerQuantity
  size: string; // Size selectedOption value, or 'OS' for one-size products
  quantity: number;
  image: string; // variant image URL, '' if none
  currencyCode: string; // e.g. 'USD' — from cost.amountPerQuantity.currencyCode
}

/**
 * A Shopify cart snapshot — the authoritative cart state returned by the cart
 * server actions and cached in the Zustand store.
 *
 * `totalQuantity` is the sum of all line quantities (NOT lines.length) and
 * drives the bag badge. `totalAmount` is an ESTIMATE — shipping and final taxes
 * are computed at Shopify's hosted checkout after the buyer enters an address;
 * `totalAmountEstimated: true` confirms this. Always label the figure
 * "Estimated total" in the UI, never "Total including shipping".
 */
export interface Cart {
  totalQuantity: number;
  checkoutUrl: string; // Shopify hosted-checkout URL — redirect target
  subtotalAmount: number; // merchandise subtotal (parsed Decimal)
  totalAmount: number; // estimated total (subtotal + discounts + tax est.)
  totalAmountEstimated: boolean;
  currencyCode: string;
  lines: CartLine[];
}