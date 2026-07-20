// ---------------------------------------------------------------------------
// Shopify Storefront API GraphQL queries (products / collections / cart).
//
// These are DOCUMENTED STRINGS, not a generated client — each operation is
// named for Shopify's query tracking and includes only the fields the UI
// actually renders (no overfetching). Variables are typed and passed
// separately (never string-interpolated) for injection safety and to enable
// Shopify-side query deduplication.
//
// Fields are chosen to match lib/types.ts exactly; the adapter
// (lib/shopify/adapter.ts) maps the response shape to our domain types.
//
// Note on `id` vs `handle`: Shopify GIDs (gid://shopify/...) are internal —
// they are NEVER exposed to the browser. Public routes use the URL-safe
// `handle`. Cart ids are the exception: they are secrets-by-design (the id
// embeds a `?key=` token) and live only in the HTTP-only cookie.
// ---------------------------------------------------------------------------

/**
 * Fields shared by the collection-products query and the product-detail
 * query, so cards and PDP never drift on what a "product" is. Used as a
 * GraphQL fragment — if a field is renamed, fix it in one place.
 *
 * `featuredImage` is the card image; `priceRange` gives the min–max display
 * on cards. Variants carry `selectedOptions` so the adapter can build the
 * "Black / XL" descriptor shown in the cart.
 */
const PRODUCT_FRAGMENT = `#graphql
  fragment ProductFields on Product {
    id
    handle
    title
    description
    featuredImage {
      url
      altText
    }
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    images(first: 10) {
      nodes {
        url
        altText
      }
    }
    variants(first: 100) {
      nodes {
        id
        title
        availableForSale
        price {
          amount
          currencyCode
        }
        image {
          url
          altText
        }
        selectedOptions {
          name
          value
        }
      }
    }
  }
`;

/**
 * Operation 1 — the collection list (/collection index).
 *
 * Fetches every collection's card data: handle (route), title, description,
 * and its image. `first: 250` is the Storefront API max — far above any real
 * collection count for this store.
 *
 * Named operation `Collections` for Shopify query tracking. Takes no
 * variables.
 */
export const COLLECTIONS_QUERY = `#graphql
  query Collections {
    collections(first: 250) {
      nodes {
        id
        handle
        title
        description
        image {
          url
          altText
        }
      }
    }
  }
`;

/**
 * Operation 2 — a single collection with its products (/collection/[handle]).
 *
 * `products(first: 250)` is the Storefront API max for the nested connection;
 * far above any real per-collection product count. Each product reuses the
 * shared ProductFields fragment.
 *
 * Named operation `CollectionByHandle` for Shopify query tracking.
 */
export const COLLECTION_BY_HANDLE_QUERY = `#graphql
  query CollectionByHandle($handle: String!) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        url
        altText
      }
      products(first: 250) {
        nodes {
          ...ProductFields
        }
      }
    }
  }
  ${PRODUCT_FRAGMENT}
`;

/**
 * Operation 3 — a single product by handle (/product/[slug]).
 *
 * Adds detail-only fields to the shared fragment: the full image list (PDP
 * gallery), `options` (with merchant swatch data for the color checkpoints),
 * and the custom `rich_text` metafields (details_fabrication, product_care,
 * product_sizing) rendered by the disclosure sections. The metafields read
 * back as null when unset or unexposed — the UI treats null as "section
 * absent".
 *
 * Named operation `ProductByHandle` for Shopify query tracking.
 */
export const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      ...ProductFields
      # Full gallery for the PDP (cards use only featuredImage).
      images(first: 20) {
        nodes {
          url
          altText
        }
      }
      # Option groups with merchant-configured swatches (color hex + texture
      # image). Selected on the DETAIL query only — collection cards (which use
      # the shared ProductFields fragment) don't pay for it. swatch.image is a
      # Media union; we resolve it to a MediaImage and select its inner
      # image { url }. swatch.color is the Storefront Color scalar (a hex
      # string). Both are nullable — the adapter threads only what's present and
      # resolveSwatch (lib/color.ts) falls back to a name→hex color, so colors
      # render even with zero Shopify Admin swatch setup.
      options {
        name
        optionValues {
          name
          swatch {
            color
            image {
              ... on MediaImage {
                image {
                  url
                }
              }
            }
          }
        }
      }
      # Custom product metafields (Rich Text). These live in the 'custom'
      # namespace and are read here — on the DETAIL query only — so collection
      # cards (which use the shared ProductFields fragment) don't pay for them.
      # The Storefront API returns a rich_text value as a JSON STRING (a tree
      # of typed nodes), NOT HTML — the client renders it via components/RichText.
      # A metafield reads back as null when the product doesn't have it set OR
      # when its definition isn't 'exposed to the Storefront API' (an admin
      # setting per definition); the UI treats null as 'section absent'.
      detailsFabrication: metafield(namespace: "custom", key: "details_fabrication") {
        value
      }
      productCare: metafield(namespace: "custom", key: "product_care") {
        value
      }
      productSizing: metafield(namespace: "custom", key: "product_sizing") {
        value
      }
    }
  }
  ${PRODUCT_FRAGMENT}
`;

/**
 * Operation 1c — all products (Shop page).
 *
 * Fetches every product in the store (up to the Storefront `first: 250` max)
 * for the `/shop` grid. Each card reuses the shared `ProductFields` fragment
 * so it shares the exact same adapter path as the collection + detail queries
 * (the card renders featuredImage → name → price range). `description` is
 * selected truncated inline because the fragment deliberately omits it and
 * `mapProduct` reads it with no fallback.
 *
 * Deliberately does NOT select `options`/`swatch` or the `custom` metafields —
 * those are PDP-only concerns (see PRODUCT_BY_HANDLE_QUERY). Keeps the shop
 * payload lean, mirroring the collection grid.
 *
 * Named operation `Products` for Shopify query tracking. Takes no variables.
 */
export const PRODUCTS_QUERY = `#graphql
  query Products {
    products(first: 250) {
      nodes {
        ...ProductFields
        description(truncateAt: 200)
      }
    }
  }
  ${PRODUCT_FRAGMENT}
`;

// ---------------------------------------------------------------------------
// Shopify Cart API operations (Phase 2 — operations 5–9).
//
// See docs/SHOPIFY_API.md §4 (operations table) and §6 (cart & checkout flow).
//
// Critical rules these queries enforce:
//   - `merchandise` is a `Merchandise` UNION — you CANNOT query
//     `merchandise { id }` (id lives on ProductVariant, not the union). Every
//     cart op uses `merchandise { ... on ProductVariant { ... } }`.
//   - `totalQuantity` is selected on every cart response (sum of all line
//     quantities) — it feeds the bag badge, NOT `lines` count.
//   - `checkoutUrl` is selected on every cart response — the redirect target
//     for Shopify's hosted checkout.
//   - `cost.totalAmountEstimated` is selected — the UI labels the figure
//     "Estimated total" because shipping + final taxes are NOT included
//     (computed at hosted checkout after the buyer enters an address).
//   - No deprecated fields: `estimatedCost`, `discountAllocations`, `priceV2`,
//     image `src`/`originalSrc`/`transformedSrc`.
//
// Variables are typed and passed separately (not interpolated) for injection
// safety and Shopify-side query deduplication — same convention as the product
// queries above. This file stays server-only (only imported by lib/cart-cookie
// consumers / server actions, never by a 'use client' component).
// ---------------------------------------------------------------------------

/**
 * Fields shared by every cart query/mutation response. Used as a GraphQL
 * fragment so the cart get + 4 mutations never drift on field selection. If
 * Shopify renames a cart field, this is the one place to fix it.
 *
 * `lines` uses `edges` / `node` (the Cart.lines connection is edge-based, unlike
 * Product.variants which is node-based). `merchandise` uses the mandatory
 * inline-fragment pattern on the `Merchandise` union.
 *
 * `lines(first: 250)` is the Storefront API max for the cart-line connection.
 * Cart-level totals (`totalQuantity`, `cost.subtotalAmount`, `cost.totalAmount`)
 * are always correct regardless of how many lines are returned; only the line
 * LIST is bounded. 250 distinct variant lines is far beyond any real apparel
 * cart — if wholesale/bulk carts ever need more, add `pageInfo` pagination.
 */
const CART_FRAGMENT = `#graphql
  fragment CartFields on Cart {
    id
    totalQuantity
    checkoutUrl
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
      totalAmount {
        amount
        currencyCode
      }
      totalAmountEstimated
    }
    lines(first: 250) {
      edges {
        node {
          id
          quantity
          cost {
            amountPerQuantity {
              amount
              currencyCode
            }
            totalAmount {
              amount
              currencyCode
            }
          }
          merchandise {
            ... on ProductVariant {
              id
              title
              price {
                amount
                currencyCode
              }
              image {
                url
                altText
              }
              selectedOptions {
                name
                value
              }
              product {
                title
                handle
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Operation 5 — read a cart by id.
 *
 * The cart id (incl. the `?key=` secret) is passed as the `$id` variable by the
 * server action, read from the HTTP-only `apeiron-cart-id` cookie. The id is
 * opaque — never parse, split, or log it. `cart` may be null if the cart expired.
 *
 * Named operation `CartGet` for Shopify query tracking.
 */
export const CART_GET_QUERY = `#graphql
  query CartGet($id: ID!) {
    cart(id: $id) {
      ...CartFields
    }
  }
  ${CART_FRAGMENT}
`;

/**
 * Operation 6 — create a new cart with one or more lines.
 *
 * Called on the first "Add to bag" when no cart id cookie exists yet. The
 * server action stores the returned `cart.id` (full, incl. `?key=`) in the
 * HTTP-only cookie. `input.lines[].merchandiseId` is the ProductVariant GID;
 * `quantity` is the line count. No price is ever sent — Shopify prices the line.
 *
 * Named operation `CartCreate` for Shopify query tracking.
 */
export const CART_CREATE_MUTATION = `#graphql
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
      }
    }
  }
  ${CART_FRAGMENT}
`;

/**
 * Operation 7 — add lines to an existing cart.
 *
 * Called on "Add to bag" when a cart id cookie already exists. `cartId` is the
 * full opaque cart id from the cookie; `lines[].merchandiseId` is the variant
 * GID. No price is sent.
 *
 * Named operation `CartLinesAdd` for Shopify query tracking.
 */
export const CART_LINES_ADD_MUTATION = `#graphql
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
      }
    }
  }
  ${CART_FRAGMENT}
`;

/**
 * Operation 8 — update line quantities.
 *
 * `lines[].id` is the CART-LINE GID (NOT the variant GID) — the unique line
 * identity returned by the cart response and held as `CartLine.lineId`. The
 * server action routes `quantity <= 0` to cartLinesRemove instead of this.
 *
 * Named operation `CartLinesUpdate` for Shopify query tracking.
 */
export const CART_LINES_UPDATE_MUTATION = `#graphql
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
      }
    }
  }
  ${CART_FRAGMENT}
`;

/**
 * Operation 9 — remove lines by their cart-line GIDs.
 *
 * `lineIds` are CART-LINE GIDs (NOT variant GIDs). Called by the server action
 * for explicit removal and for quantity-to-zero.
 *
 * Named operation `CartLinesRemove` for Shopify query tracking.
 */
export const CART_LINES_REMOVE_MUTATION = `#graphql
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ...CartFields
      }
      userErrors {
        field
        message
      }
    }
  }
  ${CART_FRAGMENT}
`;

// ---------------------------------------------------------------------------
// Shopify Cart delivery + buyer-identity operations (Phase 4b — custom checkout).
//
// These power the custom /checkout page: set the buyer's email/phone/country,
// set the shipping delivery address (selected: true triggers rate calc), and
// select a shipping method — all BEFORE handing off to cart.checkoutUrl,
// which then prefills Shopify's hosted checkout (card entry happens there).
//
// Flat/static shipping rates are returned synchronously via
// `cart.deliveryGroups.nodes[].deliveryOptions` — NO @defer / withCarrierRates
// (carrier-calculated rates are out of scope for v1; they'd need @defer + a
// streaming client + a qualifying plan).
//
// Trust invariants (same as the line mutations):
//   - Variables carry only contact/address fields, countryCode, zip,
//     deliveryGroupId, deliveryOptionHandle. NO price is ever sent — Shopify
//     prices every line and computes shipping/tax itself. (No provinceCode is
//     sent — Shopify derives the subdivision from the postal code.)
//   - `cartId` is the opaque cart id (incl. `?key=`) from the cookie, passed
//     VERBATIM — never parsed/logged/returned.
//   - `userErrors` are logged server-side; the client gets a generic message.
//     These mutations ALSO return `warnings` (non-fatal, e.g. "address could
//     not be validated") — logged server-side, never surfaced, never block.
//
// Deprecated fields avoided:
//   - `deliveryAddressPreferences` on CartBuyerIdentityInput (deprecated since
//     2025-01) — we set the address via cartDeliveryAddressesAdd/Update instead.
//   - `estimatedCost` (Cart.estimatedCost), cart-level `discountAllocations`,
//     `totalTaxAmount`, `totalDutyAmount`, `MailingAddressInput` — none used.
// ---------------------------------------------------------------------------

/**
 * Delivery-group fields shared by the cart-with-delivery query and the Phase 4b
 * mutations. Selects the available `deliveryOptions` (shipping methods + their
 * `estimatedCost`) and the currently `selectedDeliveryOption`, on each delivery
 * group. v1 reads the PRIMARY group only (deliveryGroups.nodes[0]); multi-group
 * / split-shipment UI is out of scope.
 */
const DELIVERY_GROUPS_FRAGMENT = `#graphql
  fragment DeliveryGroupsFields on Cart {
    deliveryGroups(first: 250) {
      nodes {
        id
        selectedDeliveryOption {
          handle
          code
          title
          description
          estimatedCost {
            amount
            currencyCode
          }
          deliveryMethodType
        }
        deliveryOptions {
          handle
          code
          title
          description
          estimatedCost {
            amount
            currencyCode
          }
          deliveryMethodType
        }
      }
    }
  }
`;

/**
 * Operation 10 — read a cart by id WITH its delivery groups (shipping options).
 *
 * Used by the checkout server actions to (a) detect an existing selected
 * delivery address (so we update rather than accumulate on re-submit) and
 * (b) read the available delivery options after setting the address. Differs
 * from CART_GET_QUERY only by additionally selecting deliveryGroups.
 *
 * Named operation `CartWithDelivery` for Shopify query tracking.
 */
export const CART_WITH_DELIVERY_QUERY = `#graphql
  query CartWithDelivery($id: ID!) {
    cart(id: $id) {
      ...CartFields
      ...DeliveryGroupsFields
    }
  }
  ${CART_FRAGMENT}
  ${DELIVERY_GROUPS_FRAGMENT}
`;

/**
 * Operation 11 — set the buyer's email, phone, and country (for market pricing).
 *
 * Sets ONLY the contact fields — the shipping ADDRESS is set separately via
 * CART_DELIVERY_ADDRESSES_ADD/UPDATE (deliveryAddressPreferences is deprecated).
 * `buyerIdentity` is passed as a typed CartBuyerIdentityInput variable.
 *
 * Named operation `CartBuyerIdentityUpdate` for Shopify query tracking.
 */
export const CART_BUYER_IDENTITY_UPDATE_MUTATION = `#graphql
  mutation CartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        ...CartFields
        ...DeliveryGroupsFields
      }
      userErrors {
        field
        message
      }
      warnings {
        code
        message
      }
    }
  }
  ${CART_FRAGMENT}
  ${DELIVERY_GROUPS_FRAGMENT}
`;

/**
 * Operation 12 — add a delivery (shipping) address to the cart.
 *
 * `addresses` is `[CartSelectableAddressInput!]!`; the action passes a single
 * entry with `selected: true` (which triggers rate calculation for that address)
 * and `address.deliveryAddress` (a CartDeliveryAddressInput — countryCode is a
 * code; no provinceCode is sent, Shopify derives the subdivision from zip).
 * Used when no delivery address exists yet.
 *
 * Named operation `CartDeliveryAddressesAdd` for Shopify query tracking.
 */
export const CART_DELIVERY_ADDRESSES_ADD_MUTATION = `#graphql
  mutation CartDeliveryAddressesAdd($cartId: ID!, $addresses: [CartSelectableAddressInput!]!) {
    cartDeliveryAddressesAdd(cartId: $cartId, addresses: $addresses) {
      cart {
        ...CartFields
        ...DeliveryGroupsFields
      }
      userErrors {
        field
        message
      }
      warnings {
        code
        message
      }
    }
  }
  ${CART_FRAGMENT}
  ${DELIVERY_GROUPS_FRAGMENT}
`;

/**
 * Operation 13 — update an existing delivery address on the cart (by its id).
 *
 * Used when the buyer re-submits the address form after an address already
 * exists (idempotent: avoids accumulating duplicate addresses). `addresses` is
 * `[CartSelectableAddressUpdateInput!]!`; each entry needs the address `id`
 * (the CartSelectableAddress GID), `selected: true`, and the new address.
 *
 * Named operation `CartDeliveryAddressesUpdate` for Shopify query tracking.
 */
export const CART_DELIVERY_ADDRESSES_UPDATE_MUTATION = `#graphql
  mutation CartDeliveryAddressesUpdate($cartId: ID!, $addresses: [CartSelectableAddressUpdateInput!]!) {
    cartDeliveryAddressesUpdate(cartId: $cartId, addresses: $addresses) {
      cart {
        ...CartFields
        ...DeliveryGroupsFields
      }
      userErrors {
        field
        message
      }
      warnings {
        code
        message
      }
    }
  }
  ${CART_FRAGMENT}
  ${DELIVERY_GROUPS_FRAGMENT}
`;

/**
 * Operation 14 — persist the buyer's shipping-method choice on the cart.
 *
 * `deliveryGroupId` + `deliveryOptionHandle` are the two OPAQUE handles from
 * the cart's deliveryGroups (never constructed client-side). After this, the
 * cart's `cost.totalAmount` includes shipping (label may still be "Estimated").
 * From here, `cart.checkoutUrl` prefills contact + address + shipping method.
 *
 * Named operation `CartSelectedDeliveryOptionsUpdate` for Shopify tracking.
 */
export const CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION = `#graphql
  mutation CartSelectedDeliveryOptionsUpdate($cartId: ID!, $selectedDeliveryOptions: [CartSelectedDeliveryOptionInput!]!) {
    cartSelectedDeliveryOptionsUpdate(cartId: $cartId, selectedDeliveryOptions: $selectedDeliveryOptions) {
      cart {
        ...CartFields
        ...DeliveryGroupsFields
      }
      userErrors {
        field
        message
      }
      warnings {
        code
        message
      }
    }
  }
  ${CART_FRAGMENT}
  ${DELIVERY_GROUPS_FRAGMENT}
`;
