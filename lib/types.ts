// Shared domain types. Kept framework-agnostic so they can be imported by
// server components, server actions, and client components alike.

/**
 * A single selectable value within a product option group (e.g. "Red", "Small").
 * `inStock` is an AGGREGATE across every variant that offers this value — true
 * if ANY such variant is `availableForSale`. For multi-dimension products
 * (Size × Color) this is an over-approximation: a value can show as in stock
 * when the specific cross-dimension combination the buyer selects is not. That
 * is acceptable for the picker UX; the actual cart add resolves the EXACT
 * variant from `Product.variants` (see `resolveSelectedVariant`), so an
 * out-of-stock combination resolves to null and is never added.
 *
 * `price` / `image` are likewise aggregates (min price / first image across the
 * variants offering this value) and are display-only for the picker. The live
 * price + gallery image come from the resolved `ProductVariant`.
 *
 * `colorHex` / `swatchImage` are sourced from Shopify's `swatch` data on the
 * option value (see `lib/shopify/queries.ts` `PRODUCT_BY_HANDLE_QUERY`) and are
 * undefined for products/options without configured swatches (and on the
 * collection-card path, which doesn't select the `options` connection). The
 * color picker renders a visual swatch from these via `resolveSwatch`
 * (`lib/color.ts`), with a name→hex fallback so any color renders even with no
 * Shopify Admin setup.
 */
export interface ProductOptionValue {
  value: string;
  inStock: boolean;
  price: number;
  // The variant's own image URL, falling back to the product's featuredImage
  // when the variant has none. '' when neither the variant nor the product has
  // an image (never an empty <img src>).
  image: string;
  // Shopify `swatch.color` (a hex string) for this option value, when the
  // merchant configured a swatch in Shopify Admin. Undefined when absent.
  colorHex?: string;
  // Shopify `swatch.image` URL for this option value (texture / pattern), when
  // the merchant configured an image swatch. Undefined when absent.
  swatchImage?: string;
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

/**
 * A single sellable variant — one combination of option values (e.g. Color=Black
 * + Size=large). This is the FULL variant matrix: the source of truth for variant
 * identity, price, image, and availability. `resolveSelectedVariant` matches the
 * buyer's per-group selection against `selectedOptions` to find the exact
 * variant to add to the cart — this is what makes multi-dimension products work
 * (the per-value `ProductOptionValue` aggregates cannot represent a specific
 * combination, which is why the old single-dimension resolver always added the
 * first/cheapest size regardless of the selected size).
 *
 * `id` is the Shopify ProductVariant GID used to create a cart line. `price` is
 * display-only (Shopify prices the line at checkout). `image` is the variant's
 * own image, falling back to the product's featuredImage.
 */
export interface ProductVariant {
  id: string; // Shopify ProductVariant GID — passed to cartLinesAdd/cartCreate
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
  price: number; // variant's own price — display + optimistic cart line
  image: string; // variant image URL, '' if neither variant nor product has one
}

export interface Product {
  id: string; // Shopify handle — used as the /product/[slug] route param
  name: string;
  price: number; // minVariantPrice — display fallback / single-price products
  priceMax: number; // maxVariantPrice — equals `price` when all variants share one price
  description: string;
  images: string[];
  options: ProductOption[]; // grouped per-dimension values for picker rendering
  variants: ProductVariant[]; // full matrix — source of truth for variant resolution
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
  name: string; // display name (product title)
  price: number; // display-only, from Shopify cost.amountPerQuantity
  // The variant descriptor shown under the line: ALL selectedOption values
  // joined in Shopify order (e.g. "Black / large"), skipping a lone 'Title'
  // group; 'OS' when no real options remain (one-size / single-variant items).
  // Built server-side from the resolved variant's selectedOptions and mirrored
  // EXACTLY by the optimistic line in the cart store, so the two never flicker.
  variantLabel: string;
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
