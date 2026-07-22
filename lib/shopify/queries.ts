// ---------------------------------------------------------------------------
// GraphQL queries + fragments for the Shopify Storefront API.
//
// Every query is a plain string constant — no gql tag, no codegen. Field
// selection lives here (not at call sites) so a Shopify API version bump or a
// new field requirement changes ONE file. Response types: lib/shopify/types.ts.
// ---------------------------------------------------------------------------

// Shared product fields, used by BOTH the collection query (product cards) and
// the product detail query. Cards need: handle/title for the link, priceRange
// for the price line, featuredImage for the card image, and variants for the
// in-stock check. The detail page re-uses the fragment and selects its extras
// (images connection, options connection with swatches, rich-text metafields)
// on top — one source of truth for the shared shape.
export const PRODUCT_FRAGMENT = /* GraphQL */ `
  fragment ProductFields on Product {
    id
    handle
    title
    description
    featuredImage {
      url
      altText
    }
    variants(first: 100) {
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

// 3.1 Collections list — one entry per collection (up to 24), each with its
// first product's featuredImage as a card fallback.
export const COLLECTION_LIST_QUERY = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query Collections {
    collections(first: 24) {
      nodes {
        handle
        title
        description
        image {
          url
          altText
        }
        products(first: 1) {
          nodes {
            ...ProductFields
          }
        }
      }
    }
  }
`;

// 3.2 Collection detail — the collection + its products (up to 24) for the
// category page grid.
export const COLLECTION_BY_HANDLE_QUERY = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query CollectionByHandle($handle: String!) {
    collectionByHandle(handle: $handle) {
      handle
      title
      description
      image {
        url
        altText
      }
      products(first: 24) {
        nodes {
          ...ProductFields
        }
      }
    }
  }
`;

// 3.3 Product detail — the full product by handle (URL slug). Selects the
// images connection for the gallery, the options connection (with per-value
// swatch data) for the color picker, and the rich-text metafields for the
// disclosure sections, on top of the shared fragment.
export const PRODUCT_BY_HANDLE_QUERY = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      ...ProductFields
      images(first: 10) {
        nodes {
          url
          altText
        }
      }
      options(first: 10) {
        name
        optionValues(first: 50) {
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
      # Rich-text metafields in the `custom` namespace — each is a `rich_text`
      # JSON string rendered by components/RichText. Aliased because the
      # metafield key is a single string.
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
      # Garment size grading for the size selector's measurement readout (json
      # metafield — e.g. {"unit": "in", "anchor": "L", "chest": 23, "length":
      # 46, "chestStep": 5, "lengthStep": 3}; parsed by
      # lib/size-measurements.ts). Detail only.
      sizeMeasurements: metafield(namespace: "custom", key: "size_measurements") {
        value
      }
    }
  }
`;

// 3.4 All products (Shop page grid) — the full catalog (up to 250, the
// Storefront API max page size). Sorted by title for a stable grid; the shop
// page re-sorts client-side where needed.
export const PRODUCTS_QUERY = /* GraphQL */ `
  ${PRODUCT_FRAGMENT}
  query Products {
    products(first: 250, sortKey: TITLE) {
      nodes {
        ...ProductFields
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Cart queries + mutations (Phase 2 — operations 5–9).
//
// One shared fragment (CART_FIELDS) returns the full cart snapshot after
// EVERY operation — cart queries AND mutations all return the same shape, so
// the client always has a complete, current cart to cache. This is the
// Shopify Cart API pattern: mutate → receive the whole cart back.
//
// Shape notes (see lib/shopify/types.ts for the full rationale):
//   - lines use `edges` / `node` (edge-based connection, unlike Product.variants)
//   - merchandise needs an inline fragment on ProductVariant (Merchandise union)
//   - every operation includes userErrors (checked at the call site)
// ---------------------------------------------------------------------------

// Shared cart fields — the complete cart snapshot. `id` is included so the
// client can pass it back to subsequent mutations (and to correlate the
// persisted cart id cookie). `totalQuantity` drives the bag badge (sum of
// line quantities, NOT lines.length). `checkoutUrl` is the hosted-checkout
// redirect target. `deliveryGroups` is deliberately NOT selected here — the
// plain cart get / line mutations don't need it (checkout selects it via
// CART_WITH_DELIVERY_QUERY below).
export const CART_FIELDS = /* GraphQL */ `
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
    lines(first: 100) {
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

// 5. Get cart by id — the resume/rehydrate query. `cart(id:)` returns null
// for an unknown/expired id; the call site treats null as "no cart yet".
export const CART_GET_QUERY = /* GraphQL */ `
  ${CART_FIELDS}
  query CartGet($cartId: ID!) {
    cart(id: $cartId) {
      ...CartFields
    }
  }
`;

// 6. Create cart — optionally with initial lines. The Storefront API creates
// an empty cart when `lines` is omitted; the id (+ ?key= secret) comes back
// in the response and is persisted by the server action as the cart cookie.
export const CART_CREATE_MUTATION = /* GraphQL */ `
  ${CART_FIELDS}
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
`;

// 7. Add lines to an existing cart.
export const CART_LINES_ADD_MUTATION = /* GraphQL */ `
  ${CART_FIELDS}
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
`;

// 8. Update line quantities (quantity 0 removes the line, but the dedicated
// remove mutation is preferred for clarity).
export const CART_LINES_UPDATE_MUTATION = /* GraphQL */ `
  ${CART_FIELDS}
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
`;

// 9. Remove lines from the cart.
export const CART_LINES_REMOVE_MUTATION = /* GraphQL */ `
  ${CART_FIELDS}
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
`;

// ---------------------------------------------------------------------------
// Phase 4b — custom checkout queries + mutations.
//
// The /checkout page needs three things the plain cart ops don't return:
//   1. The deliveryGroups connection (available shipping methods + costs)
//   2. Mutations to set buyer identity (email), the delivery address, and the
//      selected delivery option
//
// DELIVERY_GROUP_FIELDS mirrors the SHOPIFY_API.md §8 selection; it is added
// to the cart fragment for the checkout-facing operations only (CART_WITH_DELIVERY_QUERY
// + the four mutations below), keeping the plain cart ops lean.
//
// `warnings` is selected alongside `userErrors` on the Phase 4b mutations:
// warnings are non-fatal (logged server-side, never surfaced); userErrors are
// hard failures (thrown as generic messages — never leaked to the client).
// ---------------------------------------------------------------------------

// Shared delivery-group fields — the available shipping options + the
// currently selected one, per group. v1 reads the primary (first) group only.
export const DELIVERY_GROUP_FIELDS = /* GraphQL */ `
  fragment DeliveryGroupFields on DeliveryGroup {
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
    deliveryOptions(first: 10) {
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
`;

// Cart get WITH delivery groups — used by the checkout server actions so the
// /checkout page gets the order summary + shipping choices in one round trip.
export const CART_WITH_DELIVERY_QUERY = /* GraphQL */ `
  ${CART_FIELDS}
  ${DELIVERY_GROUP_FIELDS}
  query CartWithDelivery($cartId: ID!) {
    cart(id: $cartId) {
      ...CartFields
      deliveryGroups(first: 10) {
        nodes {
          ...DeliveryGroupFields
        }
      }
    }
  }
`;

// Set the buyer's email (buyer identity) on the cart. Required before the
// delivery address so Shopify can validate + return shipping rates.
export const CART_BUYER_IDENTITY_UPDATE_MUTATION = /* GraphQL */ `
  ${CART_FIELDS}
  ${DELIVERY_GROUP_FIELDS}
  mutation CartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        ...CartFields
        deliveryGroups(first: 10) {
          nodes {
            ...DeliveryGroupFields
          }
        }
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
`;

// Add the delivery address to the cart. Triggers Shopify to compute the
// available delivery options + their costs for that address.
export const CART_DELIVERY_ADDRESSES_ADD_MUTATION = /* GraphQL */ `
  ${CART_FIELDS}
  ${DELIVERY_GROUP_FIELDS}
  mutation CartDeliveryAddressesAdd($cartId: ID!, $addresses: [CartAddressInput!]!) {
    cartDeliveryAddressesAdd(cartId: $cartId, addresses: $addresses) {
      cart {
        ...CartFields
        deliveryGroups(first: 10) {
          nodes {
            ...DeliveryGroupFields
          }
        }
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
`;

// Update the delivery address (the addressId addresses the existing address).
export const CART_DELIVERY_ADDRESSES_UPDATE_MUTATION = /* GraphQL */ `
  ${CART_FIELDS}
  ${DELIVERY_GROUP_FIELDS}
  mutation CartDeliveryAddressesUpdate($cartId: ID!, $addresses: [CartAddressUpdateInput!]!) {
    cartDeliveryAddressesUpdate(cartId: $cartId, addresses: $addresses) {
      cart {
        ...CartFields
        deliveryGroups(first: 10) {
          nodes {
            ...DeliveryGroupFields
          }
        }
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
`;

// Select a delivery option (shipping method). `deliveryOptionHandle` is the
// opaque handle from the deliveryOptions list — the browser sends ONLY
// handle + deliveryGroupId, never a price.
export const CART_SELECTED_DELIVERY_OPTIONS_UPDATE_MUTATION = /* GraphQL */ `
  ${CART_FIELDS}
  ${DELIVERY_GROUP_FIELDS}
  mutation CartSelectedDeliveryOptionsUpdate($cartId: ID!, $selectedDeliveryOptions: [CartSelectedDeliveryOptionInput!]!) {
    cartSelectedDeliveryOptionsUpdate(cartId: $cartId, selectedDeliveryOptions: $selectedDeliveryOptions) {
      cart {
        ...CartFields
        deliveryGroups(first: 10) {
          nodes {
            ...DeliveryGroupFields
          }
        }
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
`;

// ---------------------------------------------------------------------------
// Metaobjects (Help Center content).
//
// Two aliased `metaobjects` connections — one per accepted definition handle.
// `faq_entry` is preferred; `help_question` is the documented handle for a
// recreated definition (the Help Center falls back to it when no faq_entry
// entries exist). Both select the field key/value pairs; lib/help.ts merges
// them into question/answer pairs.
// ---------------------------------------------------------------------------
export const HELP_QUESTIONS_QUERY = /* GraphQL */ `
  query HelpQuestions {
    faqEntries: metaobjects(type: "faq_entry", first: 100) {
      edges {
        node {
          fields {
            key
            value
          }
        }
      }
    }
    helpQuestions: metaobjects(type: "help_question", first: 100) {
      edges {
        node {
          fields {
            key
            value
          }
        }
      }
    }
  }
`;
