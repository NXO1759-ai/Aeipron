// ---------------------------------------------------------------------------
// Cart-with-delivery fixture data for the checkout adapter tests (Phase 4b).
// Mirrors the raw Shopify Storefront API cart response when the
// DeliveryGroupsFields fragment is selected (CART_WITH_DELIVERY_QUERY + the
// checkout mutations). Extends the existing cart-node fixtures by adding
// `deliveryGroups`. Typed to ShopifyCartNode from lib/shopify/types.
// ---------------------------------------------------------------------------

import type { ShopifyCartNode } from '@/lib/shopify/types';

/**
 * A cart with one delivery group containing two shipping options (Standard +
 * Express), none selected yet. The address has been set (so deliveryOptions
 * are populated). Used to test mapDeliveryGroups maps options + null selected.
 */
export const twoOptionsCartNode: ShopifyCartNode = {
  id: 'gid://shopify/Cart/dlv00001?key=dlvkey',
  totalQuantity: 2,
  checkoutUrl: 'https://aeipron.myshopify.com/cart/c/dlv00001?key=dlvkey',
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
          merchandise: {
            id: 'gid://shopify/ProductVariant/46514157256901',
            title: 'Small',
            price: { amount: '10.0', currencyCode: 'USD' },
            image: { url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/shirt.jpg', altText: null },
            selectedOptions: [{ name: 'Size', value: 'Small' }],
            product: { title: 'Shirts', handle: 'shirts' },
          },
        },
      },
    ],
  },
  deliveryGroups: {
    nodes: [
      {
        id: 'gid://shopify/CartDeliveryGroup/dg-1',
        selectedDeliveryOption: null,
        deliveryOptions: [
          {
            handle: 'shopify-Standard-0',
            code: 'standard',
            title: 'Standard Shipping',
            description: '5-7 business days',
            estimatedCost: { amount: '5.00', currencyCode: 'USD' },
            deliveryMethodType: 'SHIPPING',
          },
          {
            handle: 'shopify-Express-1',
            code: 'express',
            title: 'Express Shipping',
            description: '1-2 business days',
            estimatedCost: { amount: '15.00', currencyCode: 'USD' },
            deliveryMethodType: 'SHIPPING',
          },
        ],
      },
    ],
  },
};

/**
 * The same cart but with Express selected. `selectedDeliveryOption` is set and
 * `cost.totalAmount` reflects the shipping (20 subtotal + 15 shipping = 35).
 * Used to test the selectedHandle mapping + that totals include shipping.
 */
export const selectedOptionCartNode: ShopifyCartNode = {
  ...twoOptionsCartNode,
  id: 'gid://shopify/Cart/dlv00002?key=dlvkey2',
  checkoutUrl: 'https://aeipron.myshopify.com/cart/c/dlv00002?key=dlvkey2',
  cost: {
    subtotalAmount: { amount: '20.0', currencyCode: 'USD' },
    totalAmount: { amount: '35.00', currencyCode: 'USD' },
    totalAmountEstimated: true,
  },
  deliveryGroups: {
    nodes: [
      {
        id: 'gid://shopify/CartDeliveryGroup/dg-1',
        selectedDeliveryOption: {
          handle: 'shopify-Express-1',
          code: 'express',
          title: 'Express Shipping',
          description: '1-2 business days',
          estimatedCost: { amount: '15.00', currencyCode: 'USD' },
          deliveryMethodType: 'SHIPPING',
        },
        deliveryOptions: [
          {
            handle: 'shopify-Standard-0',
            code: 'standard',
            title: 'Standard Shipping',
            description: '5-7 business days',
            estimatedCost: { amount: '5.00', currencyCode: 'USD' },
            deliveryMethodType: 'SHIPPING',
          },
          {
            handle: 'shopify-Express-1',
            code: 'express',
            title: 'Express Shipping',
            description: '1-2 business days',
            estimatedCost: { amount: '15.00', currencyCode: 'USD' },
            deliveryMethodType: 'SHIPPING',
          },
        ],
      },
    ],
  },
};

/**
 * A cart whose delivery group has NO delivery options — the address country
 * has no shipping zone / is in an inactive market. Shopify returns an empty
 * list (not an error); the UI must show "We don't ship there yet". Used to test
 * the empty-options edge case.
 */
export const noOptionsCartNode: ShopifyCartNode = {
  ...twoOptionsCartNode,
  id: 'gid://shopify/Cart/dlv00003?key=dlvkey3',
  deliveryGroups: {
    nodes: [
      {
        id: 'gid://shopify/CartDeliveryGroup/dg-2',
        selectedDeliveryOption: null,
        deliveryOptions: [],
      },
    ],
  },
};

/**
 * A cart WITHOUT the deliveryGroups field selected (as returned by the plain
 * CART_GET_QUERY / line mutations). Used to test that mapDeliveryGroups returns
 * [] and mapCheckoutDetails still produces a valid CheckoutDetails.
 */
export const noDeliveryFieldCartNode: ShopifyCartNode = {
  id: 'gid://shopify/Cart/dlv00004?key=dlvkey4',
  totalQuantity: 2,
  checkoutUrl: 'https://aeipron.myshopify.com/cart/c/dlv00004?key=dlvkey4',
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
          merchandise: {
            id: 'gid://shopify/ProductVariant/46514157256901',
            title: 'Small',
            price: { amount: '10.0', currencyCode: 'USD' },
            image: null,
            selectedOptions: [{ name: 'Size', value: 'Small' }],
            product: { title: 'Shirts', handle: 'shirts' },
          },
        },
      },
    ],
  },
};