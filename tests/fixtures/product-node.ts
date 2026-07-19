// ---------------------------------------------------------------------------
// Fixture data matching the raw Shopify Storefront API response shapes.
// Used by adapter tests so we don't need a live Shopify connection.
// Typed to ShopifyProductNode / ShopifyCollectionNode from lib/shopify/types.
// ---------------------------------------------------------------------------

import type { ShopifyProductNode, ShopifyCollectionNode } from '@/lib/shopify/types';

/**
 * A product with Size variants (Small / medium / large) at different prices.
 * Mirrors the live "Shirts" product in the Shopify store.
 */
export const shirtsProductNode: ShopifyProductNode = {
  id: 'gid://shopify/Product/8918638756037',
  handle: 'shirts',
  title: 'Shirts',
  description: 'A premium shirt collection.',
  featuredImage: {
    url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/shirt.jpg',
    altText: null,
  },
  variants: {
    nodes: [
      {
        id: 'gid://shopify/ProductVariant/46514157256901',
        availableForSale: true,
        selectedOptions: [{ name: 'Size', value: 'Small' }],
        price: { amount: '10.0', currencyCode: 'USD' },
        image: null,
      },
      {
        id: 'gid://shopify/ProductVariant/46514157289669',
        availableForSale: true,
        selectedOptions: [{ name: 'Size', value: 'medium' }],
        price: { amount: '20.0', currencyCode: 'USD' },
        image: null,
      },
      {
        id: 'gid://shopify/ProductVariant/46514157322437',
        availableForSale: true,
        selectedOptions: [{ name: 'Size', value: 'large' }],
        price: { amount: '30.0', currencyCode: 'USD' },
        image: null,
      },
    ],
  },
  priceRange: {
    minVariantPrice: { amount: '10.0', currencyCode: 'USD' },
    maxVariantPrice: { amount: '30.0', currencyCode: 'USD' },
  },
};

/**
 * A product with Color variants (Red / Black / White) at the same price.
 * Mirrors the live "Lorem ipsum... (Copy)" product in the Shopify store.
 */
export const colorProductNode: ShopifyProductNode = {
  id: 'gid://shopify/Product/8914891899077',
  handle: 'lorem-ipsum-dolor-sit-amet-consectetur-copy',
  title: 'Lorem ipsum dolor sit amet consectetur (Copy)',
  description: 'Lorem ipsum dolor sit amet.',
  featuredImage: {
    url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/photo1.jpg',
    altText: null,
  },
  // Rich-text metafields (JSON strings) — only present on the detail query.
  // `productSizing` is null to exercise the null → undefined mapping; the
  // other two carry a minimal rich-text root.
  detailsFabrication: {
    value: JSON.stringify({
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: '100% cotton.' }] }],
    }),
  },
  productCare: {
    value: JSON.stringify({
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Machine wash cold.' }] }],
    }),
  },
  productSizing: null,
  images: {
    nodes: [
      { url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/photo1.jpg', altText: null },
      { url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/photo2.jpg', altText: null },
      { url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/photo3.jpg', altText: null },
    ],
  },
  // The `options` connection with merchant-configured swatches — selected on
  // the DETAIL query only. Red/Black carry a hex color; White carries a texture
  // image swatch (exercises both swatch shapes).
  options: [
    {
      name: 'Color',
      optionValues: [
        { name: 'Red', swatch: { color: '#ff0000', image: null } },
        { name: 'Black', swatch: { color: '#000000', image: null } },
        {
          name: 'White',
          swatch: {
            color: null,
            image: { url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/white-texture.jpg' },
          },
        },
      ],
    },
  ],
  variants: {
    nodes: [
      {
        id: 'gid://shopify/ProductVariant/46514160959685',
        availableForSale: true,
        selectedOptions: [{ name: 'Color', value: 'Red' }],
        price: { amount: '50.0', currencyCode: 'USD' },
        image: {
          url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/red.jpg',
          altText: 'Red variant',
        },
      },
      {
        id: 'gid://shopify/ProductVariant/46514160992453',
        availableForSale: true,
        selectedOptions: [{ name: 'Color', value: 'Black' }],
        price: { amount: '50.0', currencyCode: 'USD' },
        image: {
          url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/black.jpg',
          altText: 'Black variant',
        },
      },
      {
        id: 'gid://shopify/ProductVariant/46514161025221',
        availableForSale: false,
        selectedOptions: [{ name: 'Color', value: 'White' }],
        price: { amount: '50.0', currencyCode: 'USD' },
        image: null,
      },
    ],
  },
  priceRange: {
    minVariantPrice: { amount: '50.0', currencyCode: 'USD' },
    maxVariantPrice: { amount: '50.0', currencyCode: 'USD' },
  },
};

/**
 * A product with only a "Default Title" option (no Size, no Color).
 * Mirrors the live "Lorem ipsum..." product that has a single variant.
 */
export const defaultTitleProductNode: ShopifyProductNode = {
  id: 'gid://shopify/Product/8914870763717',
  handle: 'lorem-ipsum-dolor-sit-amet-consectetur',
  title: 'Lorem ipsum dolor sit amet consectetur',
  description: 'A single-variant product.',
  featuredImage: {
    url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/photo1.jpg',
    altText: null,
  },
  variants: {
    nodes: [
      {
        id: 'gid://shopify/ProductVariant/46508146000069',
        availableForSale: false,
        selectedOptions: [{ name: 'Title', value: 'Default Title' }],
        price: { amount: '50.0', currencyCode: 'USD' },
        image: null,
      },
    ],
  },
  priceRange: {
    minVariantPrice: { amount: '50.0', currencyCode: 'USD' },
    maxVariantPrice: { amount: '50.0', currencyCode: 'USD' },
  },
};

/**
 * A collection with an image and one product.
 * Mirrors the live "Shirts" collection in the Shopify store.
 */
export const shirtsCollectionNode: ShopifyCollectionNode = {
  handle: 'shirts',
  title: 'Shirts',
  description: 'A collection of premium shirts.',
  image: { url: 'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/collection.jpg', altText: null },
  products: { nodes: [shirtsProductNode] },
};

/**
 * A collection with NO image (image is null) — tests the fallback
 * to the first product's featuredImage.
 * Mirrors the live "Home page" collection.
 */
export const noImageCollectionNode: ShopifyCollectionNode = {
  handle: 'frontpage',
  title: 'Home page',
  description: '',
  image: null,
  products: { nodes: [colorProductNode, defaultTitleProductNode] },
};