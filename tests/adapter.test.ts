import { describe, it, expect, vi } from 'vitest';

// adapter.ts imports 'server-only' (build-time guard against client imports);
// under Vitest its default export throws, so mock it to an empty module.
vi.mock('server-only', () => ({}));

import { mapProduct, mapCollectionSummary } from '@/lib/shopify/adapter';
import {
  shirtsProductNode,
  colorProductNode,
  defaultTitleProductNode,
  shirtsCollectionNode,
  noImageCollectionNode,
} from './fixtures/product-node';

// ---------------------------------------------------------------------------
// mapProduct tests
// ---------------------------------------------------------------------------

describe('mapProduct', () => {
  describe('identity mapping', () => {
    it('maps Shopify handle to Product.id (for URL routing)', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.id).toBe('shirts');
    });

    it('maps Shopify title to Product.name', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.name).toBe('Shirts');
    });

    it('maps Shopify description to Product.description', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.description).toBe('A premium shirt collection.');
    });
  });

  describe('price mapping', () => {
    it('parses minVariantPrice.amount (Decimal string) to number', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.price).toBe(10);
    });

    it('parses maxVariantPrice.amount to Product.priceMax', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.priceMax).toBe(30);
    });

    it('price equals priceMax when all variants share one price', () => {
      const product = mapProduct(colorProductNode);
      expect(product.price).toBe(50);
      expect(product.priceMax).toBe(50);
    });
  });

  describe('image mapping', () => {
    it('uses the images connection when present (product detail page)', () => {
      const product = mapProduct(colorProductNode);
      expect(product.images).toHaveLength(3);
      expect(product.images[0]).toContain('cdn.shopify.com');
    });

    it('falls back to featuredImage when images is absent (collection cards)', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.images).toHaveLength(1);
      expect(product.images[0]).toBe(shirtsProductNode.featuredImage!.url);
    });

    it('returns empty array when neither images nor featuredImage exist', () => {
      const node = { ...shirtsProductNode, featuredImage: null };
      const product = mapProduct(node);
      expect(product.images).toEqual([]);
    });
  });

  describe('option grouping', () => {
    it('groups Size variants into one ProductOption named "Size"', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.options).toHaveLength(1);
      expect(product.options[0].name).toBe('Size');
    });

    it('groups Color variants into one ProductOption named "Color"', () => {
      const product = mapProduct(colorProductNode);
      expect(product.options).toHaveLength(1);
      expect(product.options[0].name).toBe('Color');
    });

    it('preserves variant values in first-seen order', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.options[0].values.map((v) => v.value)).toEqual([
        'Small',
        'medium',
        'large',
      ]);
    });

    it('preserves variant values for Color in first-seen order', () => {
      const product = mapProduct(colorProductNode);
      expect(product.options[0].values.map((v) => v.value)).toEqual([
        'Red',
        'Black',
        'White',
      ]);
    });

    it('groups "Default Title" into an option named "Title"', () => {
      const product = mapProduct(defaultTitleProductNode);
      expect(product.options).toHaveLength(1);
      expect(product.options[0].name).toBe('Title');
      expect(product.options[0].values[0].value).toBe('Default Title');
    });
  });

  describe('stock mapping', () => {
    it('maps availableForSale → inStock (true)', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.options[0].values[0].inStock).toBe(true);
    });

    it('maps availableForSale → inStock (false for White)', () => {
      const product = mapProduct(colorProductNode);
      const white = product.options[0].values.find((v) => v.value === 'White');
      expect(white?.inStock).toBe(false);
    });

    it('maps availableForSale → inStock (false for Default Title)', () => {
      const product = mapProduct(defaultTitleProductNode);
      expect(product.options[0].values[0].inStock).toBe(false);
    });
  });

  describe('variantId mapping', () => {
    it('maps Shopify variant id → ProductOptionValue.variantId', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.options[0].values[0].variantId).toBe(
        'gid://shopify/ProductVariant/46514157256901',
      );
    });

    it('maps each variant to its own variantId', () => {
      const product = mapProduct(colorProductNode);
      const red = product.options[0].values.find((v) => v.value === 'Red');
      const black = product.options[0].values.find((v) => v.value === 'Black');
      expect(red?.variantId).not.toBe(black?.variantId);
    });
  });

  describe('price per option value', () => {
    it('maps the variant price to ProductOptionValue.price', () => {
      const product = mapProduct(shirtsProductNode);
      const small = product.options[0].values.find((v) => v.value === 'Small');
      const large = product.options[0].values.find((v) => v.value === 'large');
      expect(small?.price).toBe(10);
      expect(large?.price).toBe(30);
    });
  });
});

// ---------------------------------------------------------------------------
// mapCollectionSummary tests
// ---------------------------------------------------------------------------

describe('mapCollectionSummary', () => {
  it('maps Shopify handle to CollectionSummary.id (for URL routing)', () => {
    const summary = mapCollectionSummary(shirtsCollectionNode);
    expect(summary.id).toBe('shirts');
  });

  it('maps Shopify title to CollectionSummary.name', () => {
    const summary = mapCollectionSummary(shirtsCollectionNode);
    expect(summary.name).toBe('Shirts');
  });

  it('maps Shopify description to CollectionSummary.description', () => {
    const summary = mapCollectionSummary(shirtsCollectionNode);
    expect(summary.description).toBe('A collection of premium shirts.');
  });

  it('uses collection.image when present', () => {
    const summary = mapCollectionSummary(shirtsCollectionNode);
    expect(summary.image).toBe(shirtsCollectionNode.image!.url);
  });

  it('falls back to first product featuredImage when collection image is null', () => {
    const summary = mapCollectionSummary(noImageCollectionNode);
    expect(summary.image).toBe(colorProductNode.featuredImage!.url);
  });

  it('returns empty string when no collection image and no products', () => {
    const emptyNode = { ...noImageCollectionNode, products: { nodes: [] } };
    const summary = mapCollectionSummary(emptyNode);
    expect(summary.image).toBe('');
  });
});