import { describe, it, expect } from 'vitest';
import { resolveSelectedVariant } from '@/lib/product';
import type { Product, ProductVariant } from '@/lib/types';

/**
 * Build a domain Product from an explicit variant matrix, deriving the
 * per-dimension option grouping the same way `mapOptions` does (aggregate
 * inStock = ANY variant available; price/image = min-price variant's). The
 * resolver matches against `variants`, so the options here only feed it the
 * group names — but we keep them consistent with the matrix so the product
 * shape is realistic.
 */
function makeProduct(variants: ProductVariant[], base: Partial<Product> = {}): Product {
  const groups = new Map<
    string,
    Map<string, { value: string; inStock: boolean; price: number; image: string }>
  >();
  for (const v of variants) {
    for (const opt of v.selectedOptions) {
      let valueMap = groups.get(opt.name);
      if (!valueMap) {
        valueMap = new Map();
        groups.set(opt.name, valueMap);
      }
      const existing = valueMap.get(opt.value);
      if (!existing) {
        valueMap.set(opt.value, {
          value: opt.value,
          inStock: v.availableForSale,
          price: v.price,
          image: v.image,
        });
      } else {
        existing.inStock = existing.inStock || v.availableForSale;
        if (v.price < existing.price) {
          existing.price = v.price;
          existing.image = v.image;
        }
      }
    }
  }
  return {
    id: 'test-product',
    name: 'Test Product',
    price: 100,
    priceMax: 100,
    description: '',
    images: [],
    options: Array.from(groups.entries()).map(([name, valueMap]) => ({
      name,
      values: Array.from(valueMap.values()),
    })),
    variants,
    ...base,
  };
}

describe('resolveSelectedVariant', () => {
  it('returns null when the product has no option groups', () => {
    const product = makeProduct([]);
    expect(resolveSelectedVariant(product, {})).toBeNull();
  });

  it('returns null when no option group has a selection yet', () => {
    const product = makeProduct([
      {
        id: 'gid/S',
        availableForSale: true,
        selectedOptions: [{ name: 'Size', value: 'S' }],
        price: 100,
        image: '',
      },
    ]);
    expect(resolveSelectedVariant(product, {})).toBeNull();
  });

  it('returns null when only some option groups are selected (multi-dimension)', () => {
    const product = makeProduct([
      {
        id: 'gid/Black-S',
        availableForSale: true,
        selectedOptions: [
          { name: 'Size', value: 'S' },
          { name: 'Color', value: 'Black' },
        ],
        price: 100,
        image: '',
      },
    ]);
    expect(resolveSelectedVariant(product, { Size: 'S' })).toBeNull();
  });

  it('returns null when the matched variant is out of stock', () => {
    const product = makeProduct([
      {
        id: 'gid/S',
        availableForSale: false,
        selectedOptions: [{ name: 'Size', value: 'S' }],
        price: 100,
        image: '',
      },
    ]);
    expect(resolveSelectedVariant(product, { Size: 'S' })).toBeNull();
  });

  it('returns the selected in-stock variant (single-dimension)', () => {
    const product = makeProduct([
      { id: 'gid/S', availableForSale: true, selectedOptions: [{ name: 'Size', value: 'S' }], price: 100, image: '' },
      { id: 'gid/M', availableForSale: true, selectedOptions: [{ name: 'Size', value: 'M' }], price: 100, image: '' },
      { id: 'gid/L', availableForSale: false, selectedOptions: [{ name: 'Size', value: 'L' }], price: 100, image: '' },
    ]);
    const resolved = resolveSelectedVariant(product, { Size: 'M' });
    expect(resolved).not.toBeNull();
    expect(resolved!.id).toBe('gid/M');
  });

  it('exposes the selected variant price so the UI can update the displayed price', () => {
    // Different variants have different prices — the UI must show the selected
    // one, not the product's min price.
    const product = makeProduct(
      [
        { id: 'gid/S', availableForSale: true, selectedOptions: [{ name: 'Size', value: 'S' }], price: 90, image: '' },
        { id: 'gid/M', availableForSale: true, selectedOptions: [{ name: 'Size', value: 'M' }], price: 110, image: '' },
        { id: 'gid/L', availableForSale: true, selectedOptions: [{ name: 'Size', value: 'L' }], price: 120, image: '' },
      ],
      { price: 90, priceMax: 120 },
    );

    const s = resolveSelectedVariant(product, { Size: 'S' });
    const m = resolveSelectedVariant(product, { Size: 'M' });
    const l = resolveSelectedVariant(product, { Size: 'L' });

    expect((s as ProductVariant).price).toBe(90);
    expect((m as ProductVariant).price).toBe(110);
    expect((l as ProductVariant).price).toBe(120);
    // When nothing is selected, no price is resolved (the UI falls back to the range).
    expect(resolveSelectedVariant(product, {})).toBeNull();
  });

  it('exposes the selected variant image so the gallery can switch with the selection', () => {
    // Each variant carries its own image — the gallery must show the selected
    // variant's image, falling back to the product image when none is set.
    const product = makeProduct([
      { id: 'gid/Red', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Red' }], price: 50, image: 'https://cdn.shopify.com/red.jpg' },
      { id: 'gid/Black', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Black' }], price: 50, image: 'https://cdn.shopify.com/black.jpg' },
      { id: 'gid/White', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'White' }], price: 50, image: '' },
    ]);

    expect((resolveSelectedVariant(product, { Color: 'Red' }) as ProductVariant).image).toBe(
      'https://cdn.shopify.com/red.jpg',
    );
    expect((resolveSelectedVariant(product, { Color: 'Black' }) as ProductVariant).image).toBe(
      'https://cdn.shopify.com/black.jpg',
    );
    // A variant with no image resolves to '' — the gallery falls back to product.images[0].
    expect((resolveSelectedVariant(product, { Color: 'White' }) as ProductVariant).image).toBe('');
    // Nothing selected → no resolved image (gallery shows the default).
    expect(resolveSelectedVariant(product, {})).toBeNull();
  });

  it('resolves a 2-dimension selection to the exact matching variant', () => {
    // Color × Size: selecting Color=Black + Size=large must resolve to the
    // Black/large variant — NOT the first/cheapest size of the first group.
    const product = makeProduct([
      { id: 'gid/Black-S', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'S' }], price: 80, image: 'img/Black-S' },
      { id: 'gid/Black-M', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'M' }], price: 80, image: 'img/Black-M' },
      { id: 'gid/Black-L', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'L' }], price: 80, image: 'img/Black-L' },
      { id: 'gid/Champ-S', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Champagne' }, { name: 'Size', value: 'S' }], price: 80, image: 'img/Champ-S' },
      { id: 'gid/Champ-L', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Champagne' }, { name: 'Size', value: 'L' }], price: 80, image: 'img/Champ-L' },
    ]);

    expect(resolveSelectedVariant(product, { Color: 'Black', Size: 'L' })?.id).toBe('gid/Black-L');
    expect(resolveSelectedVariant(product, { Color: 'Champagne', Size: 'S' })?.id).toBe('gid/Champ-S');
  });

  it('returns null when the exact combination is out of stock (even if each value is in stock)', () => {
    // Black/large is unavailable, but Black (via Black-S/M) and large (via
    // Champ-L) are both in stock at the per-value aggregate. The resolver must
    // use the SPECIFIC variant's availability, so Black+large → null.
    const product = makeProduct([
      { id: 'gid/Black-S', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'S' }], price: 80, image: '' },
      { id: 'gid/Black-L', availableForSale: false, selectedOptions: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'L' }], price: 80, image: '' },
      { id: 'gid/Champ-L', availableForSale: true, selectedOptions: [{ name: 'Color', value: 'Champagne' }, { name: 'Size', value: 'L' }], price: 80, image: '' },
    ]);
    expect(resolveSelectedVariant(product, { Color: 'Black', Size: 'L' })).toBeNull();
  });
});