import { describe, it, expect } from 'vitest';
import { resolveSelectedVariant } from '@/lib/product';
import type { Product, ProductOptionValue } from '@/lib/types';

/** Build a domain Product from a compact option spec for resolver tests. */
function makeProduct(
  options: Array<{ name: string; values: Array<{ value: string; inStock: boolean; price: number; variantId: string; image?: string }> }>,
  base: Partial<Product> = {},
): Product {
  return {
    id: 'test-product',
    name: 'Test Product',
    price: 100,
    priceMax: 100,
    description: '',
    images: [],
    ...base,
    options: options.map((o) => ({
      name: o.name,
      values: o.values.map((v) => ({
        value: v.value,
        inStock: v.inStock,
        price: v.price,
        variantId: v.variantId,
        image: v.image ?? '',
      })),
    })),
  };
}

describe('resolveSelectedVariant', () => {
  it('returns null when the product has no option groups', () => {
    const product = makeProduct([]);
    expect(resolveSelectedVariant(product, {})).toBeNull();
  });

  it('returns null when no option group has a selection yet', () => {
    const product = makeProduct([
      { name: 'Size', values: [{ value: 'S', inStock: true, price: 100, variantId: 'gid/S/S' }] },
    ]);
    expect(resolveSelectedVariant(product, {})).toBeNull();
  });

  it('returns null when only some option groups are selected (multi-dimension)', () => {
    const product = makeProduct([
      { name: 'Size', values: [{ value: 'S', inStock: true, price: 100, variantId: 'gid/S' }] },
      { name: 'Color', values: [{ value: 'Black', inStock: true, price: 100, variantId: 'gid/S-Black' }] },
    ]);
    expect(resolveSelectedVariant(product, { Size: 'S' })).toBeNull();
  });

  it('returns null when the selected value is out of stock', () => {
    const product = makeProduct([
      {
        name: 'Size',
        values: [{ value: 'S', inStock: false, price: 100, variantId: 'gid/S' }],
      },
    ]);
    expect(resolveSelectedVariant(product, { Size: 'S' })).toBeNull();
  });

  it('returns the selected in-stock variant value (single-dimension)', () => {
    const product = makeProduct([
      {
        name: 'Size',
        values: [
          { value: 'S', inStock: true, price: 100, variantId: 'gid/S' },
          { value: 'M', inStock: true, price: 100, variantId: 'gid/M' },
          { value: 'L', inStock: false, price: 100, variantId: 'gid/L' },
        ],
      },
    ]);
    const resolved = resolveSelectedVariant(product, { Size: 'M' });
    expect(resolved).not.toBeNull();
    expect(resolved!.variantId).toBe('gid/M');
  });

  it('exposes the selected variant price so the UI can update the displayed price', () => {
    // Different variants have different prices — the UI must show the selected
    // one, not the product's min price.
    const product = makeProduct(
      [
        {
          name: 'Size',
          values: [
            { value: 'S', inStock: true, price: 90, variantId: 'gid/S' },
            { value: 'M', inStock: true, price: 110, variantId: 'gid/M' },
            { value: 'L', inStock: true, price: 120, variantId: 'gid/L' },
          ],
        },
      ],
      { price: 90, priceMax: 120 },
    );

    const s = resolveSelectedVariant(product, { Size: 'S' });
    const m = resolveSelectedVariant(product, { Size: 'M' });
    const l = resolveSelectedVariant(product, { Size: 'L' });

    expect((s as ProductOptionValue).price).toBe(90);
    expect((m as ProductOptionValue).price).toBe(110);
    expect((l as ProductOptionValue).price).toBe(120);
    // When nothing is selected, no price is resolved (the UI falls back to the range).
    expect(resolveSelectedVariant(product, {})).toBeNull();
  });

  it('exposes the selected variant image so the gallery can switch with the selection', () => {
    // Each variant carries its own image — the gallery must show the selected
    // variant's image, falling back to the product image when none is set.
    const product = makeProduct([
      {
        name: 'Color',
        values: [
          { value: 'Red', inStock: true, price: 50, variantId: 'gid/Red', image: 'https://cdn.shopify.com/red.jpg' },
          { value: 'Black', inStock: true, price: 50, variantId: 'gid/Black', image: 'https://cdn.shopify.com/black.jpg' },
          { value: 'White', inStock: true, price: 50, variantId: 'gid/White', image: '' },
        ],
      },
    ]);

    expect((resolveSelectedVariant(product, { Color: 'Red' }) as ProductOptionValue).image).toBe(
      'https://cdn.shopify.com/red.jpg',
    );
    expect((resolveSelectedVariant(product, { Color: 'Black' }) as ProductOptionValue).image).toBe(
      'https://cdn.shopify.com/black.jpg',
    );
    // A variant with no image resolves to '' — the gallery falls back to product.images[0].
    expect((resolveSelectedVariant(product, { Color: 'White' }) as ProductOptionValue).image).toBe('');
    // Nothing selected → no resolved image (gallery shows the default).
    expect(resolveSelectedVariant(product, {})).toBeNull();
  });
});