import { describe, it, expect } from 'vitest';
import { resolveSelectedVariant } from '@/lib/product';
import type { Product, ProductVariant } from '@/lib/types';

// Regression test for the reported multi-dimension bug: on a 2-dim product
// (Color × Size), selecting Color=Black + Size=large must resolve to the
// Black/large variant GID — NOT the first/cheapest size of the first group.
// Built from the live Hoodie shape (6 variants = 2 colors × 3 sizes).
//
// The old single-dimension resolver returned product.options[0].values[0]
// (Black/Small) regardless of the selected size, because variant identity was
// pinned to the per-value aggregate (variantId = first/cheapest size). The
// matrix-based resolver matches the full selectedOptions combination instead.

const combo = (color: string, size: string, id: string, availableForSale = true): ProductVariant => ({
  id,
  availableForSale,
  selectedOptions: [
    { name: 'Color', value: color },
    { name: 'Size', value: size },
  ],
  price: 80,
  image: `img/${color}-${size}`,
});

function makeHoodie(overrides: Partial<ProductVariant>[] = []): Product {
  const base: ProductVariant[] = [
    combo('Black', 'Small', 'gid/Black-Small'),
    combo('Black', 'medium', 'gid/Black-medium'),
    combo('Black', 'large', 'gid/Black-large'),
    combo('Champagne', 'Small', 'gid/Champagne-Small'),
    combo('Champagne', 'medium', 'gid/Champagne-medium'),
    combo('Champagne', 'large', 'gid/Champagne-large'),
  ];
  const variants = base.map((v) => {
    const override = overrides.find((o) => o.id === v.id);
    return override ? { ...v, ...override } : v;
  });
  return {
    id: 'hoodie',
    name: 'Hoodie',
    price: 80,
    priceMax: 80,
    description: '',
    images: [],
    // Per-value aggregates — derived the same way mapOptions does. Each Color
    // and each Size shows in stock because at least one combination is available.
    options: [
      {
        name: 'Color',
        values: [
          { value: 'Black', inStock: true, price: 80, image: 'img/Black' },
          { value: 'Champagne', inStock: true, price: 80, image: 'img/Champagne' },
        ],
      },
      {
        name: 'Size',
        values: [
          { value: 'Small', inStock: true, price: 80, image: 'img/Small' },
          { value: 'medium', inStock: true, price: 80, image: 'img/medium' },
          { value: 'large', inStock: true, price: 80, image: 'img/large' },
        ],
      },
    ],
    variants,
  };
}

describe('REGRESSION: 2-dim variant resolution (Color × Size)', () => {
  it('selecting Black + large resolves to the Black/large variant (was Small)', () => {
    const resolved = resolveSelectedVariant(makeHoodie(), { Color: 'Black', Size: 'large' });
    expect(resolved?.id).toBe('gid/Black-large');
  });

  it('selecting Champagne + medium resolves to the Champagne/medium variant', () => {
    const resolved = resolveSelectedVariant(makeHoodie(), { Color: 'Champagne', Size: 'medium' });
    expect(resolved?.id).toBe('gid/Champagne-medium');
  });

  it('selecting only Color resolves to null (partial selection)', () => {
    expect(resolveSelectedVariant(makeHoodie(), { Color: 'Black' })).toBeNull();
  });

  it('resolves to null when the exact combination is out of stock', () => {
    // Black/large is unavailable, but Black (via Small/medium) and large (via
    // Champagne) are both in stock at the per-value aggregate. The resolver
    // must use the SPECIFIC variant's availability, so Black+large → null.
    const hoodie = makeHoodie([{ id: 'gid/Black-large', availableForSale: false }]);
    expect(resolveSelectedVariant(hoodie, { Color: 'Black', Size: 'large' })).toBeNull();
  });

  it('still resolves a different in-stock combination on the same product', () => {
    const hoodie = makeHoodie([{ id: 'gid/Black-large', availableForSale: false }]);
    expect(resolveSelectedVariant(hoodie, { Color: 'Black', Size: 'medium' })?.id).toBe(
      'gid/Black-medium',
    );
  });
});