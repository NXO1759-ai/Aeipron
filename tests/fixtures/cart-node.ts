// ---------------------------------------------------------------------------
// Cart fixture data matching the raw Shopify Storefront API Cart response.
// Used by cart-adapter tests so we don't need a live Shopify connection.
// Typed to ShopifyCartNode / ShopifyCartLine from lib/shopify/types.
//
// Modeled on the verified live response in docs/SHOPIFY_API.md §6:
//   cart.id           = gid://shopify/Cart/<token>?key=<secret>
//   cart.checkoutUrl  = https://<store>.myshopify.com/cart/c/<token>?key=...
//   cart.totalQuantity = sum of line quantities
//   cart.lines        = { edges: [ { node: ShopifyCartLine } ] }  (edge-based)
// ---------------------------------------------------------------------------

import type { ShopifyCartNode, ShopifyCartLine } from '@/lib/shopify/types';

/**
 * A reusable ProductVariant-shaped merchandise block for a "Shirts" Small
 * variant. Mirrors the variant GID used in tests/fixtures/product-node.ts so
 * cross-references stay consistent.
 */
const shirtsSmallMerchandise = {
  id: 'gid://shopify/ProductVariant/46514157256901',
  title: 'Small',
  price: { amount: '10.0', currencyCode: 'USD' },
  image: {
    url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/shirt.jpg',
    altText: 'Shirts — Small',
  },
  selectedOptions: [{ name: 'Size', value: 'Small' }],
  product: { title: 'Shirts', handle: 'shirts' },
};

/**
 * A single-line cart: one "Shirts / Small" line, quantity 2.
 * `totalAmountEstimated: true` is the normal Shopify cart state (shipping +
 * final taxes are added at hosted checkout).
 */
export const singleLineCartNode: ShopifyCartNode = {
  id: 'gid://shopify/Cart/hWNEDKXF5vLvcFgfLPyS0xP9?key=2891fdade96d3f136d2e670174626694',
  totalQuantity: 2,
  checkoutUrl:
    'https://aeipron.myshopify.com/cart/c/hWNEDKXF5vLvcFgfLPyS0xP9?key=2891fdade96d3f136d2e670174626694',
  cost: {
    subtotalAmount: { amount: '20.0', currencyCode: 'USD' },
    totalAmount: { amount: '20.0', currencyCode: 'USD' },
    totalAmountEstimated: true,
  },
  lines: {
    edges: [
      {
        node: {
          id: 'gid://shopify/CartLine/abc123',
          quantity: 2,
          cost: {
            amountPerQuantity: { amount: '10.0', currencyCode: 'USD' },
            totalAmount: { amount: '20.0', currencyCode: 'USD' },
          },
          merchandise: shirtsSmallMerchandise,
        },
      },
    ],
  },
};

/**
 * A two-line cart: "Shirts / Small" x2 + "Lorem / Red" x3. Tests multi-line
 * mapping, line ordering (first-seen), and totalQuantity = 5 (NOT 2).
 */
export const multiLineCartNode: ShopifyCartNode = {
  id: 'gid://shopify/Cart/multi0001?key=multikey',
  totalQuantity: 5,
  checkoutUrl: 'https://aeipron.myshopify.com/cart/c/multi0001?key=multikey',
  cost: {
    subtotalAmount: { amount: '170.0', currencyCode: 'USD' },
    totalAmount: { amount: '170.0', currencyCode: 'USD' },
    totalAmountEstimated: true,
  },
  lines: {
    edges: [
      {
        node: {
          id: 'gid://shopify/CartLine/abc123',
          quantity: 2,
          cost: {
            amountPerQuantity: { amount: '10.0', currencyCode: 'USD' },
            totalAmount: { amount: '20.0', currencyCode: 'USD' },
          },
          merchandise: shirtsSmallMerchandise,
        },
      },
      {
        node: {
          id: 'gid://shopify/CartLine/def456',
          quantity: 3,
          cost: {
            amountPerQuantity: { amount: '50.0', currencyCode: 'USD' },
            totalAmount: { amount: '150.0', currencyCode: 'USD' },
          },
          merchandise: {
            id: 'gid://shopify/ProductVariant/46514160959685',
            title: 'Red',
            price: { amount: '50.0', currencyCode: 'USD' },
            image: {
              url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/red.jpg',
              altText: 'Lorem — Red',
            },
            selectedOptions: [{ name: 'Color', value: 'Red' }],
            product: { title: 'Lorem ipsum dolor sit amet consectetur (Copy)', handle: 'lorem-ipsum-dolor-sit-amet-consectetur-copy' },
          },
        },
      },
    ],
  },
};

/**
 * An empty cart: zero lines, zero quantity. Tests empty-edges mapping and that
 * totalQuantity: 0 is preserved (the bag badge should read 0, not undefined).
 */
export const emptyCartNode: ShopifyCartNode = {
  id: 'gid://shopify/Cart/empty0000?key=emptykey',
  totalQuantity: 0,
  checkoutUrl: 'https://aeipron.myshopify.com/cart/c/empty0000?key=emptykey',
  cost: {
    subtotalAmount: { amount: '0.0', currencyCode: 'USD' },
    totalAmount: { amount: '0.0', currencyCode: 'USD' },
    totalAmountEstimated: true,
  },
  lines: { edges: [] },
};

/**
 * A cart line whose merchandise has NO image (`image: null`) — tests the image
 * fallback to '' so the drawer never crashes on a missing variant image. Also
 * uses a variant with no `Size` selectedOption (a "Title / Default Title" item),
 * exercising the `lineSize` `'OS'` fallback.
 */
export const nullImageCartLine: ShopifyCartLine = {
  id: 'gid://shopify/CartLine/noimg789',
  quantity: 1,
  cost: {
    amountPerQuantity: { amount: '50.0', currencyCode: 'USD' },
    totalAmount: { amount: '50.0', currencyCode: 'USD' },
  },
  merchandise: {
    id: 'gid://shopify/ProductVariant/46508146000069',
    title: 'Default Title',
    price: { amount: '50.0', currencyCode: 'USD' },
    image: null,
    selectedOptions: [{ name: 'Title', value: 'Default Title' }],
    product: { title: 'Lorem ipsum dolor sit amet consectetur', handle: 'lorem-ipsum-dolor-sit-amet-consectetur' },
  },
};

/**
 * A cart wrapping `nullImageCartLine`. Used to test image + size fallbacks in
 * the full `mapCart` path.
 */
export const nullImageCartNode: ShopifyCartNode = {
  id: 'gid://shopify/Cart/noimg0000?key=noimgkey',
  totalQuantity: 1,
  checkoutUrl: 'https://aeipron.myshopify.com/cart/c/noimg0000?key=noimgkey',
  cost: {
    subtotalAmount: { amount: '50.0', currencyCode: 'USD' },
    totalAmount: { amount: '50.0', currencyCode: 'USD' },
    totalAmountEstimated: true,
  },
  lines: { edges: [{ node: nullImageCartLine }] },
};

/**
 * A cart whose `totalAmountEstimated` is `false`. Shopify always returns `true`
 * for carts today, but the type permits `false` (e.g. a future fixed-total
 * cart) — this fixture guards that the boolean is passed through verbatim
 * rather than hardcoded.
 */
export const fixedTotalCartNode: ShopifyCartNode = {
  ...singleLineCartNode,
  id: 'gid://shopify/Cart/fixed0000?key=fixedkey',
  cost: {
    subtotalAmount: { amount: '20.0', currencyCode: 'USD' },
    totalAmount: { amount: '20.0', currencyCode: 'USD' },
    totalAmountEstimated: false,
  },
};

/**
 * A cart priced in EUR — tests currency passthrough (currencyCode on the line
 * and on the cart total) and that `formatCurrency` would use the right symbol.
 */
export const euroCartNode: ShopifyCartNode = {
  id: 'gid://shopify/Cart/eur000001?key=eurkey',
  totalQuantity: 1,
  checkoutUrl: 'https://aeipron.myshopify.com/cart/c/eur000001?key=eurkey',
  cost: {
    subtotalAmount: { amount: '12.50', currencyCode: 'EUR' },
    totalAmount: { amount: '12.50', currencyCode: 'EUR' },
    totalAmountEstimated: true,
  },
  lines: {
    edges: [
      {
        node: {
          id: 'gid://shopify/CartLine/eurline1',
          quantity: 1,
          cost: {
            amountPerQuantity: { amount: '12.50', currencyCode: 'EUR' },
            totalAmount: { amount: '12.50', currencyCode: 'EUR' },
          },
          merchandise: {
            id: 'gid://shopify/ProductVariant/eurVariant001',
            title: 'Medium',
            price: { amount: '12.50', currencyCode: 'EUR' },
            image: {
              url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/eur.jpg',
              altText: 'EUR item',
            },
            selectedOptions: [{ name: 'Size', value: 'Medium' }],
            product: { title: 'Euro Tee', handle: 'euro-tee' },
          },
        },
      },
    ],
  },
};