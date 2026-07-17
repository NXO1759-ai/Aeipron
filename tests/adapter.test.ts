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

  describe('variants matrix', () => {
    // The full variant matrix is the source of truth for resolving the exact
    // variant to add to the cart (see resolveSelectedVariant). Each entry
    // carries its Shopify GID, availability, full selectedOptions, price, image.

    it('maps each Shopify variant node to a ProductVariant with its GID', () => {
      const product = mapProduct(shirtsProductNode);
      expect(product.variants).toHaveLength(3);
      expect(product.variants[0].id).toBe('gid://shopify/ProductVariant/46514157256901');
      expect(product.variants.map((v) => v.id)).toEqual([
        'gid://shopify/ProductVariant/46514157256901',
        'gid://shopify/ProductVariant/46514157289669',
        'gid://shopify/ProductVariant/46514157322437',
      ]);
    });

    it('carries availability, selectedOptions, price, and image per variant', () => {
      const product = mapProduct(colorProductNode);
      const red = product.variants.find((v) => v.selectedOptions[0].value === 'Red')!;
      expect(red.availableForSale).toBe(true);
      expect(red.selectedOptions).toEqual([{ name: 'Color', value: 'Red' }]);
      expect(red.price).toBe(50);
      expect(red.image).toBe('https://cdn.shopify.com/s/files/1/0792/2286/6117/files/red.jpg');
    });

    it('maps the White variant as not availableForSale', () => {
      const product = mapProduct(colorProductNode);
      const white = product.variants.find((v) => v.selectedOptions[0].value === 'White')!;
      expect(white.availableForSale).toBe(false);
    });

    it('falls back to the product featuredImage when a variant has no image', () => {
      // The White variant has image: null — it inherits the product's
      // featuredImage so the matrix always has a usable image per variant.
      const product = mapProduct(colorProductNode);
      const white = product.variants.find((v) => v.selectedOptions[0].value === 'White')!;
      expect(white.image).toBe(colorProductNode.featuredImage!.url);
    });

    it('falls back to featuredImage for size variants with no image', () => {
      // shirtsProductNode variants all have image: null → featuredImage fallback.
      const product = mapProduct(shirtsProductNode);
      for (const v of product.variants) {
        expect(v.image).toBe(shirtsProductNode.featuredImage!.url);
      }
    });

    it('returns empty string when neither the variant nor the product has an image', () => {
      const node = { ...shirtsProductNode, featuredImage: null };
      const product = mapProduct(node);
      expect(product.variants[0].image).toBe('');
    });

    it('keeps each variant image distinct per variant', () => {
      const product = mapProduct(colorProductNode);
      const red = product.variants.find((v) => v.selectedOptions[0].value === 'Red')!;
      const black = product.variants.find((v) => v.selectedOptions[0].value === 'Black')!;
      expect(red.image).not.toBe(black.image);
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

  describe('variant image mapping', () => {
    it('maps the variant image url to ProductOptionValue.image', () => {
      const product = mapProduct(colorProductNode);
      const red = product.options[0].values.find((v) => v.value === 'Red');
      const black = product.options[0].values.find((v) => v.value === 'Black');
      expect(red?.image).toBe('https://cdn.shopify.com/s/files/1/0792/2286/6117/files/red.jpg');
      expect(black?.image).toBe('https://cdn.shopify.com/s/files/1/0792/2286/6117/files/black.jpg');
    });

    it('passes the rich-text metafield value through verbatim (does not parse JSON)', () => {
      // The adapter is a pure shape translation — it must NOT interpret the
      // rich_text JSON; the client parses + renders it (components/RichText).
      const product = mapProduct(colorProductNode);
      expect(product.detailsFabrication).toBe(colorProductNode.detailsFabrication!.value);
      expect(product.productCare).toBe(colorProductNode.productCare!.value);
    });

    it('maps a null metafield to undefined (section treated as absent)', () => {
      const product = mapProduct(colorProductNode);
      expect(product.productSizing).toBeUndefined();
    });

    it('maps absent metafields (collection-card nodes) to undefined', () => {
      // shirtsProductNode has no metafield selections (mirrors the shared
      // fragment used by collection cards) — the fields must be undefined,
      // never throw.
      const product = mapProduct(shirtsProductNode);
      expect(product.detailsFabrication).toBeUndefined();
      expect(product.productCare).toBeUndefined();
      expect(product.productSizing).toBeUndefined();
    });

    it('falls back to the product featuredImage when the variant has no image', () => {
      // The White variant has image: null — it should inherit the product's
      // featuredImage so the gallery always has something to show.
      const product = mapProduct(colorProductNode);
      const white = product.options[0].values.find((v) => v.value === 'White');
      expect(white?.image).toBe(colorProductNode.featuredImage!.url);
    });

    it('falls back to the product featuredImage for size variants with no image', () => {
      // shirtsProductNode variants all have image: null → featuredImage fallback.
      const product = mapProduct(shirtsProductNode);
      for (const v of product.options[0].values) {
        expect(v.image).toBe(shirtsProductNode.featuredImage!.url);
      }
    });

    it('returns empty string when neither the variant nor the product has an image', () => {
      const node = { ...shirtsProductNode, featuredImage: null };
      const product = mapProduct(node);
      expect(product.options[0].values[0].image).toBe('');
    });

    it('keeps each variant image distinct per option value', () => {
      const product = mapProduct(colorProductNode);
      const red = product.options[0].values.find((v) => v.value === 'Red');
      const black = product.options[0].values.find((v) => v.value === 'Black');
      expect(red?.image).not.toBe(black?.image);
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