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
  // The variant's own image URL, falling back to the product's featuredImage
  // when the variant has none. Drives the product-gallery image switch: the
  // active image follows the selected variant (like the price). '' when
  // neither the variant nor the product has an image (never an empty <img src>).
  image: string;
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
  // Custom product metafields (Rich Text) from the `custom` namespace. Each is
  // the Storefront API `rich_text` value — a JSON STRING (a tree of typed
  // nodes), NOT HTML — rendered by components/RichText. Undefined when the
  // product doesn't have the metafield set or its definition isn't exposed to
  // the Storefront API; the UI treats undefined as "section absent".
  detailsFabrication?: string;
  productCare?: string;
  productSizing?: string;
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

// ---------------------------------------------------------------------------
// Cart delivery types (Phase 4b — custom checkout).
//
// These back the custom /checkout page: the available shipping methods
// (DeliveryOption[]) and the currently-selected one, grouped per delivery
// group. Money is parsed from Shopify Decimal strings → number at the adapter
// boundary (same convention as Cart). v1 reads the PRIMARY delivery group only
// (the first); multi-group / split-shipment UI is out of scope.
//
// `DeliveryOption.handle` is the opaque string passed back to
// `cartSelectedDeliveryOptionsUpdate` as `deliveryOptionHandle`. The browser
// sends only `handle` + `deliveryGroupId` — never a price (trust invariant).
// ---------------------------------------------------------------------------

/** A shipping method + its estimated cost, as shown in the checkout shipping step. */
export interface DeliveryOption {
  handle: string; // opaque — passed back to cartSelectedDeliveryOptionsUpdate
  code: string | null;
  title: string | null;
  description: string | null;
  cost: { amount: number; currencyCode: string }; // parsed from estimatedCost
  deliveryMethodType: string; // SHIPPING | PICKUP | LOCAL (Storefront enum)
}

/** A delivery group: the available shipping options + the currently selected one. */
export interface DeliveryGroup {
  id: string; // the deliveryGroupId passed to cartSelectedDeliveryOptionsUpdate
  deliveryOptions: DeliveryOption[];
  selectedHandle: string | null; // handle of the selected option, or null if none
}

/**
 * The cart snapshot + its delivery groups — returned by the checkout server
 * actions so the /checkout page can render the order summary (from `cart`) and
 * the shipping-method choices (from `deliveryGroups`) in one round trip.
 * `cart` is the unchanged domain `Cart` (mapCart); `deliveryGroups` is the new
 * mapping (mapDeliveryGroups).
 */
export interface CheckoutDetails {
  cart: Cart;
  deliveryGroups: DeliveryGroup[];
}