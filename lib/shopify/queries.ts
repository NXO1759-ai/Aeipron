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
// This file is server-only by virtue of only being imported by lib/catalog.ts.
// Do not import it from a 'use client' component.
// ---------------------------------------------------------------------------

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
 *   variants      — size/option matrix with availability + pricing
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
 * Operation 1 — collection page product list.
 *
 * Fetches up to 250 products (covers the launch catalog and well beyond).
 * Uses `description(truncateAt: 200)` to avoid pulling full descriptions for
 * card display — the detail query fetches the untruncated description.
 *
 * Named operation `ProductList` for Shopify query tracking / deduplication.
 */
export const PRODUCT_LIST_QUERY = `#graphql
  query ProductList {
    products(first: 250) {
      nodes {
        ...ProductFields
        description(truncateAt: 200)
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