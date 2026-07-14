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
  // The variant's own image (nullable — many variants inherit the product's
  // featuredImage). Selected in PRODUCT_FRAGMENT so the product gallery can
  // switch images with the selected variant. Always present in the query
  // response (possibly null); typed nullable for accuracy.
  image: ShopifyImage | null;
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

// ---------------------------------------------------------------------------
// Raw Shopify Cart API response shapes (Phase 2 — operations 5–9).
//
// These mirror the exact field selections in the CART_FIELDS fragment
// (lib/shopify/queries.ts). The adapter (mapCart / mapCartLine) bridges them
// to the domain Cart / CartLine types in lib/types.ts.
//
// Key shape notes (verified against the live Storefront API + SHOPIFY_API.md §6):
//   - Cart line lists use `edges` / `node` (NOT `nodes` — the Cart.lines
//     connection is edge-based, unlike Product.variants which is node-based).
//   - `merchandise` is a `Merchandise` UNION — `id`, `price`, `image`, etc. live
//     on `ProductVariant`, not on the union. The query uses an inline fragment
//     `... on ProductVariant { ... }`; since only ProductVariant is selected,
//     this type models the resolved variant directly.
//   - `amount` is always a string (Shopify Decimal scalar), parsed to number
//     at the adapter boundary.
//   - `totalAmountEstimated: true` means shipping + final taxes are NOT in
//     `totalAmount` — they are computed at Shopify's hosted checkout.
// ---------------------------------------------------------------------------

/** Money on a cart response (Decimal amount as string + currency code). */
export interface ShopifyCartMoney {
  amount: string;
  currencyCode: string;
}

/** Per-line cost: `amountPerQuantity` (unit price) and `totalAmount` (line total). */
export interface ShopifyCartLineCost {
  amountPerQuantity: ShopifyCartMoney;
  totalAmount: ShopifyCartMoney;
}

/**
 * The merchandise of a cart line, resolved to its ProductVariant via the
 * `... on ProductVariant { ... }` inline fragment. `Merchandise` is a union in
 * Shopify; we only ever select the ProductVariant member, so this type is the
 * variant shape directly. `product.title` / `product.handle` are nested for
 * display + URL routing.
 */
export interface ShopifyCartMerchandiseVariant {
  id: string; // Shopify ProductVariant GID — the `merchandiseId` for line creation
  title: string;
  price: ShopifyCartMoney;
  image: ShopifyImage | null;
  selectedOptions: ShopifySelectedOption[];
  product: { title: string; handle: string };
}

/** A single cart line node (from cart.lines.edges[].node). */
export interface ShopifyCartLine {
  id: string; // Shopify CART-LINE GID — distinct from the variant GID; used by update/remove
  quantity: number;
  cost: ShopifyCartLineCost;
  merchandise: ShopifyCartMerchandiseVariant;
}

/** Cart-level cost (subtotal, estimated total, estimate flags). */
export interface ShopifyCartCost {
  subtotalAmount: ShopifyCartMoney;
  totalAmount: ShopifyCartMoney;
  totalAmountEstimated: boolean;
}

/** A Shopify Cart node (the shared shape returned by every cart op). */
export interface ShopifyCartNode {
  id: string; // opaque, may include `?key=<secret>` — treat as opaque, never parse
  totalQuantity: number;
  checkoutUrl: string;
  cost: ShopifyCartCost;
  lines: { edges: { node: ShopifyCartLine }[] };
  // Optional — only populated by queries/mutations that select the
  // deliveryGroups connection (CART_WITH_DELIVERY_QUERY + the Phase 4b
  // checkout mutations). Absent on the plain CART_GET_QUERY / line mutations,
  // so the adapter treats it as optional and defaults to no delivery groups.
  deliveryGroups?: { nodes: ShopifyCartDeliveryGroup[] };
}

// ---------------------------------------------------------------------------
// Cart delivery shapes (Phase 4b — custom checkout).
//
// `cart.deliveryGroups.nodes[]` holds the cart's delivery groups; each group
// exposes the set `deliveryAddress`, the currently `selectedDeliveryOption`,
// and the available `deliveryOptions` (the shipping methods + their costs).
// Flat/static rates are returned synchronously — no @defer needed (carrier-
// calculated rates, which need @defer, are out of scope for v1).
//
// `selectedDeliveryOption` / `deliveryOptions[]` share the same shape
// (ShopifyCartDeliveryOption); the selected one is nullable until the buyer
// (or auto-select) picks one.
// ---------------------------------------------------------------------------

/** A delivery option (a shipping method + its estimated cost). */
export interface ShopifyCartDeliveryOption {
  handle: string; // passed to cartSelectedDeliveryOptionsUpdate as deliveryOptionHandle
  code: string | null;
  title: string | null;
  description: string | null;
  estimatedCost: ShopifyCartMoney; // MoneyV2 — amount (string) + currencyCode
  deliveryMethodType: string; // DeliveryMethodType enum: SHIPPING | PICKUP | LOCAL
}

/** A delivery group: the address + the available/selected shipping options. */
export interface ShopifyCartDeliveryGroup {
  id: string; // the deliveryGroupId passed to cartSelectedDeliveryOptionsUpdate
  selectedDeliveryOption: ShopifyCartDeliveryOption | null;
  deliveryOptions: ShopifyCartDeliveryOption[];
}

/** Shopify userErrors shape returned by cart mutations. */
export interface ShopifyCartUserError {
  field: string[] | null; // nullable per Storefront schema (null when not tied to an input field)
  message: string;
}

/** Response shape for the `cart(id:)` query (CART_GET_QUERY). */
export interface ShopifyCartResponse {
  cart: ShopifyCartNode | null;
}

/** Response shape for `cartCreate` (CART_CREATE_MUTATION). */
export interface ShopifyCartCreateResponse {
  cartCreate: { cart: ShopifyCartNode | null; userErrors: ShopifyCartUserError[] };
}

/** Response shape for `cartLinesAdd` (CART_LINES_ADD_MUTATION). */
export interface ShopifyCartLinesAddResponse {
  cartLinesAdd: { cart: ShopifyCartNode | null; userErrors: ShopifyCartUserError[] };
}

/** Response shape for `cartLinesUpdate` (CART_LINES_UPDATE_MUTATION). */
export interface ShopifyCartLinesUpdateResponse {
  cartLinesUpdate: { cart: ShopifyCartNode | null; userErrors: ShopifyCartUserError[] };
}

/** Response shape for `cartLinesRemove` (CART_LINES_REMOVE_MUTATION). */
export interface ShopifyCartLinesRemoveResponse {
  cartLinesRemove: { cart: ShopifyCartNode | null; userErrors: ShopifyCartUserError[] };
}

// ---------------------------------------------------------------------------
// Phase 4b — custom checkout mutation responses.
//
// The buyer-identity + delivery-address + selected-delivery-option mutations
// return a `warnings` array IN ADDITION to `userErrors`. `userErrors` are
// hard failures (we throw a generic message); `warnings` are non-fatal (e.g.
// "address could not be validated") — logged server-side, never surfaced to
// the client, never block the flow. Typed as `unknown[]` because we only log
// them and never read their shape.
// ---------------------------------------------------------------------------

/** Response shape for `cartBuyerIdentityUpdate`. */
export interface ShopifyCartBuyerIdentityUpdateResponse {
  cartBuyerIdentityUpdate: {
    cart: ShopifyCartNode | null;
    userErrors: ShopifyCartUserError[];
    warnings: unknown[];
  };
}

/** Response shape for `cartDeliveryAddressesAdd`. */
export interface ShopifyCartDeliveryAddressesAddResponse {
  cartDeliveryAddressesAdd: {
    cart: ShopifyCartNode | null;
    userErrors: ShopifyCartUserError[];
    warnings: unknown[];
  };
}

/** Response shape for `cartDeliveryAddressesUpdate`. */
export interface ShopifyCartDeliveryAddressesUpdateResponse {
  cartDeliveryAddressesUpdate: {
    cart: ShopifyCartNode | null;
    userErrors: ShopifyCartUserError[];
    warnings: unknown[];
  };
}

/** Response shape for `cartSelectedDeliveryOptionsUpdate`. */
export interface ShopifyCartSelectedDeliveryOptionsUpdateResponse {
  cartSelectedDeliveryOptionsUpdate: {
    cart: ShopifyCartNode | null;
    userErrors: ShopifyCartUserError[];
    warnings: unknown[];
  };
}