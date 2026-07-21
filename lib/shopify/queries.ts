// ---------------------------------------------------------------------------
// Shopify Storefront API GraphQL operation strings.
//
// All field selections are verified against the Storefront API 2025-07 docs.
// See docs/SHOPIFY_API.md §4 (operations table) and §4.1 (deprecated fields).
//
// DO NOT add deprecated fields to these queries:
//   - priceV2 / compareAtPriceV2 → use price / compareAtPrice
//   - src / originalSrc / transformedSrc → use url
//   - productByHandle → use product(handle:)
//   - estimatedCost / discountAllocations → use cost / discountApplications
//
// This file is server-only: `import 'server-only'` makes any client import
// fail at build time (the default export is a throwing stub outside Next's RSC
// compiler). Do not import it from a 'use client' component.
// ---------------------------------------------------------------------------

import 'server-only';

/**
 * Fields shared by every product query. Used as a GraphQL fragment so the
 * list and detail queries never drift out of sync on field selection. If
 * Shopify renames a field on an API version bump, this is the one place to
 * fix it — every consumer updates automatically.
 *
 * Selects:
 *   id            — Shopify GID (not used for URLs; the adapter maps handle → Product.id)
 *   handle        — SEO-friendly slug used in the /product/[slug] route
 *   title         — product display name
 *   featuredImage — primary image for collection cards
 *   variants      — size/option matrix with availability + pricing + image
 *   priceRange    — min/max variant prices for display
 *
 * Deliberately does NOT select:
 *   description       — selected per-query (list uses truncateAt, detail uses full)
 *   quantityAvailable — token-gated, returns a number; we use availableForSale (boolean) instead
 *   metafields        — not needed for v1; add per-query if required later
 *   descriptionHtml   — the prototype renders plain text, not HTML
 */
const PRODUCT_FRAGMENT = `#graphql
  fragment ProductFields on Product {
    id
    handle
    title
    featuredImage {
      url
      altText
    }
    variants(first: 50) {
      nodes {
        id
        availableForSale
        selectedOptions {
          name
          value
        }
        price {
          amount
          currencyCode
        }
        # Variant's own image (nullable). Drives the product-gallery image
        # switch: when a buyer selects a variant, the gallery shows this image,
        # falling back to the product's featuredImage when null.
        image {
          url
          altText
        }
      }
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
  }
`;

/**
 * Operation 1 — collections index (category cards).
 *
 * Fetches up to 50 collections. Each card needs a representative image; Shopify
 * Collection images are nullable, so we also pull the first product's
 * `featuredImage` as a fallback (the adapter picks `image ?? firstFeaturedImage`).
 * `description` is selected truncated for the card blurb.
 *
 * Named operation `CollectionList` for Shopify query tracking / deduplication.
 */
export const COLLECTION_LIST_QUERY = `#graphql
  query CollectionList {
    collections(first: 50) {
      nodes {
        handle
        title
        description(truncateAt: 200)
        image {
          url
        }
        products(first: 1) {
          nodes {
            featuredImage {
              url
            }
          }
        }
      }
    }
  }
`;

/**
 * Operation 1b — products within a single collection (category detail page).
 *
 * Fetches a collection by its handle and expands its products via the shared
 * `ProductFields` fragment so the cards reuse the same adapter path as the
 * product detail page. `description(truncateAt: 200)` is selected per-product
 * for the card blurb (the fragment deliberately omits `description`).
 *
 * The `$handle` variable is typed `String!` and passed separately (not
 * interpolated) to prevent injection and enable Shopify-side deduplication.
 *
 * Named operation `CollectionByHandle` for Shopify query tracking.
 */
export const COLLECTION_BY_HANDLE_QUERY = `#graphql
  query CollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) {
      handle
      title
      description
      image {
        url
      }
      products(first: 50) {
        nodes {
          ...ProductFields
          description(truncateAt: 200)
        }
      }
    }
  }
  ${PRODUCT_FRAGMENT}
`;

/**
 * Operation 2 — product detail page.
 *
 * Fetches a single product by its handle (the SEO slug used in the URL).
 * Uses the same ProductFields fragment as the list query, plus the full
 * `description` (no truncation) and the `images` connection (up to 10) for
 * the gallery.
 *
 * The `$handle` variable is typed `String!` and passed separately (not
 * interpolated into the query string) to prevent injection and enable
 * Shopify-side query deduplication.
 *
 * Named operation `ProductByHandle` for Shopify query tracking.
 */
export const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      ...ProductFields
      description
      images(first: 10) {
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
      # Fit-scale position for the Reviews disclosure (json metafield — e.g.
      # {"fit": 0} on the -2..+2 scale; parsed by lib/fit.ts). Detail only.
      fitReview: metafield(namespace: "custom", key: "review") {
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
 * Operation 14 — select a shipping method (delivery option) on the cart.
 *
 * `selectedDeliveryOptions` is `[CartSelectedDeliveryOptionInput!]!`; each
 * entry pairs a `deliveryGroupId` with the chosen `deliveryOptionHandle` (the
 * `handle` from a CartDeliveryOption read off deliveryGroups). After this
 * mutation, the cart's `cost.totalAmount` reflects the selected shipping cost
 * (still an estimate — tax/duty computed at Shopify's hosted checkout).
 *
 * Named operation `CartSelectedDeliveryOptionsUpdate` for Shopify query tracking.
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