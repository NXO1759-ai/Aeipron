// ---------------------------------------------------------------------------
// Shopify → domain adapter.
//
// Maps raw Shopify GraphQL response nodes (lib/shopify/types.ts) to the
// existing domain types (lib/types.ts). This is the single place where
// Shopify's field names and shapes are translated — when Shopify renames a
// field on an API version bump, only this file changes, not every route.
//
// Key mapping decisions:
//   - Product.id      ← node.handle      (NOT node.id — the route uses handle as the URL slug)
//   - Product.price   ← priceRange.minVariantPrice.amount (parsed string → number)
//   - Product.priceMax ← priceRange.maxVariantPrice.amount (equals price for single-price products)
//   - Product.images  ← images?.nodes ?? [featuredImage]   (fallback for collection cards)
//   - Product.options ← variants grouped by selectedOptions[].name (Size / Color / Title / …)
//   - Collection.id   ← node.handle      (route uses handle as the URL slug)
//
// Do not import this from a client component — it imports lib/shopify/types
// which carries Shopify's raw shapes and is server-side only. The
// `import 'server-only'` below makes any client import fail at build time.
// ---------------------------------------------------------------------------

import 'server-only';

import { parseFitScale } from '@/lib/fit';
import type {
  Product,
  ProductOption,
  ProductOptionValue,
  CollectionSummary,
  Cart,
  CartLine,
  DeliveryGroup,
  DeliveryOption,
  CheckoutDetails,
} from '@/lib/types';
import type {
  ShopifyProductNode,
  ShopifyProductVariant,
  ShopifyProductOption,
  ShopifyCollectionNode,
  ShopifyCartNode,
  ShopifyCartLine,
  ShopifyCartMerchandiseVariant,
  ShopifyCartDeliveryGroup,
  ShopifyCartDeliveryOption,
} from '@/lib/shopify/types';
import { variantDescriptor } from '@/lib/product';

/**
 * Map a Shopify product node to the domain Product type.
 */
export function mapProduct(node: ShopifyProductNode): Product {
  return {
    id: node.handle,
    name: node.title,
    price: Number(node.priceRange.minVariantPrice.amount),
    priceMax: Number(node.priceRange.maxVariantPrice.amount),
    description: node.description,
    images: mapImages(node),
    options: mapOptions(node.variants.nodes, node.featuredImage?.url, node.options),
    // Full variant matrix — the source of truth for resolving the exact variant
    // to add to the cart (see resolveSelectedVariant). Each variant carries its
    // GID, availability, full selectedOptions (so a multi-dimension selection
    // like Color=Black + Size=large can be matched), price, and image.
    variants: node.variants.nodes.map((v) => ({
      id: v.id,
      availableForSale: v.availableForSale,
      selectedOptions: v.selectedOptions,
      price: Number(v.price.amount),
      image: v.image?.url ?? node.featuredImage?.url ?? '',
    })),
    // Rich-text metafield values pass through verbatim as strings (undefined
    // when absent). The Storefront API returns `rich_text` as a JSON string;
    // the client parses + renders it (components/RichText) — the adapter does
    // not interpret the JSON here, keeping the Shopify→domain seam a pure
    // shape translation.
    detailsFabrication: node.detailsFabrication?.value ?? undefined,
    productCare: node.productCare?.value ?? undefined,
    productSizing: node.productSizing?.value ?? undefined,
    // Unlike the rich-text metafields above, the fit value IS interpreted here:
    // the json metafield resolves to a -2..+2 number once (parse is tolerant —
    // anything unparseable becomes 0, True To Size), so the client only ever
    // sees a number.
    fit: parseFitScale(node.fitReview?.value),
  };
}

/**
 * Map a Shopify collection node to a CollectionSummary (index card). The
 * collection image is nullable in Shopify, so we fall back to the first
 * product's featuredImage, then to an empty string if neither exists.
 */
export function mapCollectionSummary(node: ShopifyCollectionNode): CollectionSummary {
  const firstProductImage = node.products.nodes[0]?.featuredImage?.url;
  return {
    id: node.handle,
    name: node.title,
    description: node.description,
    image: node.image?.url ?? firstProductImage ?? '',
  };
}

/**
 * Extract the image URL list from a Shopify product node.
 *
 * The detail query (PRODUCT_BY_HANDLE_QUERY) returns `images(first: 10)`.
 * Collection product cards (COLLECTION_BY_HANDLE_QUERY) return only
 * `featuredImage` via the shared fragment. Fall back to `featuredImage` when
 * `images` is absent so a card always has at least one image to render.
 */
function mapImages(node: ShopifyProductNode): string[] {
  if (node.images && node.images.nodes.length > 0) {
    return node.images.nodes.map((img) => img.url);
  }
  if (node.featuredImage) {
    return [node.featuredImage.url];
  }
  return [];
}

/**
 * Collapse Shopify variant nodes into grouped domain ProductOption[].
 *
 * Each Shopify variant carries `selectedOptions` (e.g. [{ name: "Size", value: "M" }]).
 * We group values by their option `name` so the selector renders one picker per
 * dimension, labeled by the name ("Select Size", "Select Color", …).
 *
 * Aggregation per `(name, value)`:
 *   - inStock = true if ANY variant offering that value is availableForSale
 *   - price   = the minimum variant price offering that value
 *
 * This is exact for single-dimension products (the only kind in the catalog
 * today: one variant per value). For multi-dimension products (Size × Color),
 * value-level availability is an over-approximation — a value can show as in
 * stock when the specific cross-dimension combination the buyer selects is not.
 * That is acceptable for the picker UX: the actual cart add resolves the EXACT
 * variant from `Product.variants` (see `resolveSelectedVariant`), so an
 * out-of-stock combination resolves to null and is never added. The aggregation
 * keeps the selector safe and non-blocking for the single-dimension catalog.
 *
 * Groups and values are returned in first-seen order — do not sort.
 *
 * `shopifyOptions` (the `options` connection with per-value `swatch` data) is
 * optional — only the DETAIL query selects it. When present, the merchant's
 * `swatch.color` / `swatch.image` are threaded onto the matching
 * `ProductOptionValue` by `(name, value)` (case-sensitive, per Shopify). When
 * absent (collection-card path), `colorHex` / `swatchImage` stay undefined and
 * `resolveSwatch` (lib/color.ts) falls back to a name→hex color so the picker
 * still renders — see lib/color.ts.
 */
function mapOptions(
  variants: ShopifyProductVariant[],
  featuredImageUrl?: string,
  shopifyOptions?: ShopifyProductOption[],
): ProductOption[] {
  // name → { values: Map<value, {inStock, price}> } preserving insertion order.
  const groups = new Map<string, Map<string, ProductOptionValue>>();

  for (const variant of variants) {
    for (const opt of variant.selectedOptions) {
      let valueMap = groups.get(opt.name);
      if (!valueMap) {
        valueMap = new Map<string, ProductOptionValue>();
        groups.set(opt.name, valueMap);
      }
      const variantPrice = Number(variant.price.amount);
      // Variant image falls back to the product's featuredImage so every option
      // value has a usable image even when the variant has none. '' only when
      // the product itself has no featuredImage — the gallery then falls back
      // to product.images[0].
      const variantImage = variant.image?.url ?? featuredImageUrl ?? '';
      const existing = valueMap.get(opt.value);
      if (!existing) {
        valueMap.set(opt.value, {
          value: opt.value,
          inStock: variant.availableForSale,
          price: variantPrice,
          image: variantImage,
        });
      } else {
        // Aggregate across variants sharing this (name, value).
        existing.inStock = existing.inStock || variant.availableForSale;
        if (variantPrice < existing.price) {
          existing.price = variantPrice;
          existing.image = variantImage;
        }
      }
    }
  }

  // Thread merchant-configured swatch data onto the matching option values.
  // Builds a name → value → { colorHex, swatchImage } lookup so the per-variant
  // loop above stays the single source of grouping/order; the swatch is just
  // stamped on at the end. (case-sensitive name+value matching, per Shopify.)
  if (shopifyOptions && shopifyOptions.length > 0) {
    const swatchByValue = new Map<string, Map<string, { colorHex?: string; swatchImage?: string }>>();
    for (const opt of shopifyOptions) {
      let inner = swatchByValue.get(opt.name);
      if (!inner) { inner = new Map(); swatchByValue.set(opt.name, inner); }
      for (const v of opt.optionValues) {
        inner.set(v.name, {
          colorHex: v.swatch?.color ?? undefined,
          swatchImage: v.swatch?.image?.url ?? undefined,
        });
      }
    }
    for (const [name, valueMap] of groups) {
      const inner = swatchByValue.get(name);
      if (!inner) continue;
      for (const [value, optionValue] of valueMap) {
        const sw = inner.get(value);
        if (sw) {
          if (sw.colorHex !== undefined) optionValue.colorHex = sw.colorHex;
          if (sw.swatchImage !== undefined) optionValue.swatchImage = sw.swatchImage;
        }
      }
    }
  }

  // Preserve first-seen order of both groups and the values within them.
  return Array.from(groups.entries()).map(([name, valueMap]) => ({
    name,
    values: Array.from(valueMap.values()),
  }));
}

// ---------------------------------------------------------------------------
// Cart adapter (Phase 2).
//
// Maps raw Shopify cart nodes (lib/shopify/types.ts) to the domain Cart /
// CartLine types (lib/types.ts). Same conventions as the product adapter:
//   - identity comes from Shopify's GIDs, not handles
//   - money is parsed from Decimal strings (Number(amount))
//   - nullable fields fall back via ?? ('' for images)
//
// Key mapping decisions:
//   - CartLine.lineId        ← cart line node.id (the CART-LINE GID — used by
//                               cartLinesUpdate / cartLinesRemove, and as the
//                               React key. Distinct from the variant GID.)
//   - CartLine.merchandiseId  ← merchandise.id (the ProductVariant GID — used
//                               only to CREATE a line)
//   - CartLine.price         ← cost.amountPerQuantity.amount (display-only)
//   - CartLine.variantLabel  ← all selectedOptions values joined ("Black / large"),
//                               skipping a lone 'Title' group; 'OS' when none remain
//   - CartLine.image         ← merchandise.image?.url ?? ''
//   - Cart.totalQuantity     ← node.totalQuantity (sum of line quantities —
//                               feeds the bag badge, NOT lines.length)
//   - Cart.totalAmount       ← cost.totalAmount.amount (ESTIMATE — shipping
//                               and final taxes are added at hosted checkout)
// ---------------------------------------------------------------------------

/**
 * Build the display descriptor for a cart line from its merchandise variant.
 *
 * Delegates to the shared `variantDescriptor` (lib/product.ts) so the cart line
 * label and the PDP's optimistic `variantLabel` are produced by ONE function and
 * can never drift — the optimistic line and the reconciled server line are
 * byte-identical, so there is no flicker on reconcile. See `variantDescriptor`
 * for the join / 'Title' skip / 'OS' fallback rules.
 */
function lineLabel(merchandise: ShopifyCartMerchandiseVariant): string {
  return variantDescriptor(merchandise.selectedOptions);
}

/**
 * Map a Shopify cart line node to the domain CartLine.
 *
 * `lineId` is the cart-line GID (unique, stable, used by update/remove + as the
 * React key); `merchandiseId` is the ProductVariant GID (used only to create a
 * line). `price` is parsed from `cost.amountPerQuantity` and is display-only —
 * the server/Shopify is the price source of truth, the client never sends one.
 */
export function mapCartLine(node: ShopifyCartLine): CartLine {
  const variant = node.merchandise;
  return {
    lineId: node.id,
    merchandiseId: variant.id,
    name: variant.product.title,
    productHandle: variant.product.handle,
    price: Number(node.cost.amountPerQuantity.amount),
    variantLabel: lineLabel(variant),
    quantity: node.quantity,
    image: variant.image?.url ?? '',
    currencyCode: node.cost.amountPerQuantity.currencyCode,
  };
}

/**
 * Map a Shopify cart node to the domain Cart.
 *
 * `totalQuantity` is the sum of all line quantities and drives the bag badge
 * (NOT `lines.length`, which counts unique lines). `totalAmount` is an
 * ESTIMATE — shipping + final taxes are computed at Shopify's hosted checkout
 * after the buyer enters an address; `totalAmountEstimated` reflects this and
 * the UI must label the figure "Estimated total".
 */
export function mapCart(node: ShopifyCartNode): Cart {
  return {
    totalQuantity: node.totalQuantity,
    checkoutUrl: node.checkoutUrl,
    subtotalAmount: Number(node.cost.subtotalAmount.amount),
    totalAmount: Number(node.cost.totalAmount.amount),
    totalAmountEstimated: node.cost.totalAmountEstimated,
    currencyCode: node.cost.totalAmount.currencyCode,
    lines: node.lines.edges.map((edge) => mapCartLine(edge.node)),
  };
}

// ---------------------------------------------------------------------------
// Cart delivery adapter (Phase 4b — custom checkout).
//
// Maps the cart's deliveryGroups connection to the domain DeliveryGroup /
// DeliveryOption types. Called only by the checkout server actions, on cart
// responses that selected the DeliveryGroupsFields fragment. The plain
// CART_GET_QUERY / line-mutation responses do NOT select deliveryGroups, so
// mapDeliveryGroups safely returns [] when `node.deliveryGroups` is absent.
//
// Money is parsed from the Shopify Decimal string → number at this boundary
// (same convention as mapCart). `handle` is passed through verbatim — it is
// the opaque string cartSelectedDeliveryOptionsUpdate expects back, and the
// browser sends ONLY handle + deliveryGroupId (never a price).
// ---------------------------------------------------------------------------

/** Map a Shopify delivery option to the domain DeliveryOption. */
function mapDeliveryOption(option: ShopifyCartDeliveryOption): DeliveryOption {
  return {
    handle: option.handle,
    code: option.code,
    title: option.title,
    description: option.description,
    cost: {
      amount: Number(option.estimatedCost.amount),
      currencyCode: option.estimatedCost.currencyCode,
    },
    deliveryMethodType: option.deliveryMethodType,
  };
}

/** Map a Shopify delivery group to the domain DeliveryGroup. */
function mapDeliveryGroup(group: ShopifyCartDeliveryGroup): DeliveryGroup {
  return {
    id: group.id,
    deliveryOptions: group.deliveryOptions.map(mapDeliveryOption),
    selectedHandle: group.selectedDeliveryOption?.handle ?? null,
  };
}

/**
 * Map the cart's delivery groups. Returns `[]` when `deliveryGroups` was not
 * selected on the query (the plain cart get / line mutations) or when the cart
 * has no delivery groups yet (address not set, or no shipping zone for the
 * set country → Shopify returns an empty deliveryOptions list, not an error).
 */
export function mapDeliveryGroups(node: ShopifyCartNode): DeliveryGroup[] {
  if (!node.deliveryGroups) return [];
  return node.deliveryGroups.nodes.map(mapDeliveryGroup);
}

/**
 * Map a Shopify cart node to the full CheckoutDetails (cart + delivery groups).
 * Used by the checkout server actions so the /checkout page gets the order
 * summary and the shipping-method choices in one return value. `cart` is the
 * unchanged mapCart output; `deliveryGroups` is the new mapping (empty when the
 * delivery fields were not selected or no address is set).
 */
export function mapCheckoutDetails(node: ShopifyCartNode): CheckoutDetails {
  return {
    cart: mapCart(node),
    deliveryGroups: mapDeliveryGroups(node),
  };
}
