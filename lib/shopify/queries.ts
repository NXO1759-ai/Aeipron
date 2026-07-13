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
 * server action, read from the HTTP-only `aeipron-cart-id` cookie. The id is
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