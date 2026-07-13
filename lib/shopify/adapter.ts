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
  ShopifyCollectionNode,
  ShopifyCartNode,
  ShopifyCartLine,
  ShopifyCartMerchandiseVariant,
  ShopifyCartDeliveryGroup,
  ShopifyCartDeliveryOption,
} from '@/lib/shopify/types';

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
    options: mapOptions(node.variants.nodes, node.featuredImage?.url),
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
 * value-level availability is an over-approximation — a true matrix picker
 * would need the specific variant's availability, which is a Phase 2+ concern
 * (the cart will switch to the variant GID anyway). The aggregation keeps the
 * selector safe and non-blocking for v1's single-dimension catalog.
 *
 * Groups and values are returned in first-seen order — do not sort.
 */
function mapOptions(variants: ShopifyProductVariant[], featuredImageUrl?: string): ProductOption[] {
  // name → { values: Map<value, {inStock, price}> } preserving insertion order.
  const groups = new Map<string, Map<string, ProductOptionValue>>();

  for (const variant of variants) {
    for (const opt of variant.selectedOptions) {
      let valueMap = groups.get(opt.name);
      if (!valueMap) {
        valueMap = new Map();
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
          variantId: variant.id,
          image: variantImage,
        });
      } else {
        // Aggregate across variants sharing this (name, value).
        existing.inStock = existing.inStock || variant.availableForSale;
        if (variantPrice < existing.price) {
          existing.price = variantPrice;
          existing.variantId = variant.id;
          existing.image = variantImage;
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
//   - CartLine.size          ← the 'Size' selectedOption value, or 'OS' when
//                               the variant has no Size option (one-size items)
//   - CartLine.image         ← merchandise.image?.url ?? ''
//   - Cart.totalQuantity     ← node.totalQuantity (sum of line quantities —
//                               feeds the bag badge, NOT lines.length)
//   - Cart.totalAmount       ← cost.totalAmount.amount (ESTIMATE — shipping
//                               and final taxes are added at hosted checkout)
// ---------------------------------------------------------------------------

/**
 * Extract the display size from a cart line's merchandise variant.
 *
 * Mirrors the product adapter's convention: use the `Size` selectedOption value
 * when present; otherwise fall back to `'OS'` for one-size-fits-all products.
 * Lookup is case-sensitive on the option `name` — if Shopify ever returns a
 * differently-cased option name (e.g. "size"), this is the one place to fix.
 */
function lineSize(merchandise: ShopifyCartMerchandiseVariant): string {
  const size = merchandise.selectedOptions.find((o) => o.name === 'Size');
  return size ? size.value : 'OS';
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
    price: Number(node.cost.amountPerQuantity.amount),
    size: lineSize(variant),
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