import { describe, it, expect, vi } from 'vitest';

// adapter.ts imports 'server-only' (build-time guard against client imports);
// under Vitest its default export throws, so mock it to an empty module.
vi.mock('server-only', () => ({}));

import { mapCart, mapCartLine } from '@/lib/shopify/adapter';
import {
  singleLineCartNode,
  multiLineCartNode,
  emptyCartNode,
  nullImageCartNode,
  nullImageCartLine,
  fixedTotalCartNode,
  euroCartNode,
} from './fixtures/cart-node';

// ---------------------------------------------------------------------------
// mapCartLine tests
// ---------------------------------------------------------------------------

describe('mapCartLine', () => {
  describe('identity mapping', () => {
    it('maps the cart-line GID to lineId (for update/remove + React key)', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.lineId).toBe('gid://shopify/CartLine/abc123');
    });

    it('maps the ProductVariant GID to merchandiseId (for line creation)', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.merchandiseId).toBe('gid://shopify/ProductVariant/46514157256901');
    });

    it('keeps lineId and merchandiseId distinct (cart-line GID ≠ variant GID)', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.lineId).not.toBe(line.merchandiseId);
    });

    it('preserves a distinct lineId per line', () => {
      const a = mapCartLine(multiLineCartNode.lines.edges[0].node);
      const b = mapCartLine(multiLineCartNode.lines.edges[1].node);
      expect(a.lineId).not.toBe(b.lineId);
    });
  });

  describe('display mapping', () => {
    it('maps variant.product.title to name', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.name).toBe('Shirts');
    });

    it('maps quantity verbatim', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.quantity).toBe(2);
    });
  });

  describe('price mapping', () => {
    it('parses cost.amountPerQuantity.amount (Decimal string) to price', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.price).toBe(10);
    });

    it('price is the UNIT price (amountPerQuantity), NOT the line total', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      // line total is 20.0 (qty 2 × unit 10); price must be the unit 10
      expect(line.price).toBe(10);
      expect(line.price).not.toBe(20);
    });

    it('parses a different unit price per line', () => {
      const line = mapCartLine(multiLineCartNode.lines.edges[1].node);
      expect(line.price).toBe(50);
    });

    it('parses EUR amounts correctly', () => {
      const line = mapCartLine(euroCartNode.lines.edges[0].node);
      expect(line.price).toBe(12.5);
    });
  });

  describe('variantLabel mapping', () => {
    it('uses the Size selectedOption value when Size is the only option', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.variantLabel).toBe('Small');
    });

    it('uses Medium for an M-sized variant', () => {
      const line = mapCartLine(euroCartNode.lines.edges[0].node);
      expect(line.variantLabel).toBe('Medium');
    });

    it('falls back to OS for a Title-only (single-variant) product', () => {
      const line = mapCartLine(nullImageCartLine);
      expect(line.variantLabel).toBe('OS');
    });

    it('uses the Color value for a Color-only variant (no Size option)', () => {
      const line = mapCartLine(multiLineCartNode.lines.edges[1].node);
      expect(line.variantLabel).toBe('Red');
    });

    it('joins all option values for a multi-dimension variant (Color × Size)', () => {
      const line = mapCartLine({
        id: 'gid://shopify/CartLine/multi1',
        quantity: 1,
        cost: {
          amountPerQuantity: { amount: '80.0', currencyCode: 'USD' },
          totalAmount: { amount: '80.0', currencyCode: 'USD' },
        },
        merchandise: {
          id: 'gid://shopify/ProductVariant/BlackLarge',
          title: 'Black / large',
          price: { amount: '80.0', currencyCode: 'USD' },
          image: null,
          selectedOptions: [
            { name: 'Color', value: 'Black' },
            { name: 'Size', value: 'large' },
          ],
          product: { title: 'Hoodie', handle: 'hoodie' },
        },
      });
      expect(line.variantLabel).toBe('Black / large');
    });
  });

  describe('image mapping', () => {
    it('maps merchandise.image.url when present', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.image).toBe(
        'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/shirt.jpg',
      );
    });

    it('falls back to empty string when image is null', () => {
      const line = mapCartLine(nullImageCartLine);
      expect(line.image).toBe('');
    });
  });

  describe('currency mapping', () => {
    it('maps amountPerQuantity.currencyCode to currencyCode', () => {
      const line = mapCartLine(singleLineCartNode.lines.edges[0].node);
      expect(line.currencyCode).toBe('USD');
    });

    it('passes EUR currencyCode through', () => {
      const line = mapCartLine(euroCartNode.lines.edges[0].node);
      expect(line.currencyCode).toBe('EUR');
    });
  });
});

// ---------------------------------------------------------------------------
// mapCart tests
// ---------------------------------------------------------------------------

describe('mapCart', () => {
  describe('totalQuantity mapping', () => {
    it('maps node.totalQuantity (sum of line quantities, NOT line count)', () => {
      const cart = mapCart(singleLineCartNode);
      expect(cart.totalQuantity).toBe(2);
    });

    it('totalQuantity is the SUM across lines, not the number of lines', () => {
      const cart = mapCart(multiLineCartNode);
      expect(cart.totalQuantity).toBe(5);
      expect(cart.lines).toHaveLength(2);
    });

    it('preserves totalQuantity: 0 for an empty cart', () => {
      const cart = mapCart(emptyCartNode);
      expect(cart.totalQuantity).toBe(0);
    });
  });

  describe('checkout url mapping', () => {
    it('maps node.checkoutUrl to checkoutUrl', () => {
      const cart = mapCart(singleLineCartNode);
      expect(cart.checkoutUrl).toBe(
        'https://aeipron.myshopify.com/cart/c/hWNEDKXF5vLvcFgfLPyS0xP9?key=2891fdade96d3f136d2e670174626694',
      );
    });

    it('preserves the opaque ?key= secret verbatim (never parses it)', () => {
      const cart = mapCart(singleLineCartNode);
      expect(cart.checkoutUrl).toContain('?key=');
    });
  });

  describe('cost mapping', () => {
    it('parses subtotalAmount (Decimal string) to subtotalAmount', () => {
      const cart = mapCart(singleLineCartNode);
      expect(cart.subtotalAmount).toBe(20);
    });

    it('parses totalAmount (Decimal string) to totalAmount', () => {
      const cart = mapCart(multiLineCartNode);
      expect(cart.totalAmount).toBe(170);
    });

    it('passes totalAmountEstimated through as true', () => {
      const cart = mapCart(singleLineCartNode);
      expect(cart.totalAmountEstimated).toBe(true);
    });

    it('passes totalAmountEstimated through as false when Shopify says so', () => {
      const cart = mapCart(fixedTotalCartNode);
      expect(cart.totalAmountEstimated).toBe(false);
    });

    it('maps cost.totalAmount.currencyCode to currencyCode', () => {
      const cart = mapCart(singleLineCartNode);
      expect(cart.currencyCode).toBe('USD');
    });

    it('maps EUR currencyCode at the cart level', () => {
      const cart = mapCart(euroCartNode);
      expect(cart.currencyCode).toBe('EUR');
    });
  });

  describe('lines mapping', () => {
    it('maps each line via mapCartLine, preserving first-seen order', () => {
      const cart = mapCart(multiLineCartNode);
      expect(cart.lines).toHaveLength(2);
      expect(cart.lines[0].lineId).toBe('gid://shopify/CartLine/abc123');
      expect(cart.lines[1].lineId).toBe('gid://shopify/CartLine/def456');
    });

    it('returns an empty lines array for an empty cart', () => {
      const cart = mapCart(emptyCartNode);
      expect(cart.lines).toEqual([]);
    });

    it('maps line fields correctly through the full cart path', () => {
      const cart = mapCart(singleLineCartNode);
      const line = cart.lines[0];
      expect(line).toMatchObject({
        lineId: 'gid://shopify/CartLine/abc123',
        merchandiseId: 'gid://shopify/ProductVariant/46514157256901',
        name: 'Shirts',
        productHandle: 'shirts',
        price: 10,
        variantLabel: 'Small',
        quantity: 2,
        currencyCode: 'USD',
      });
    });

    it('image fallback works through the full cart path (null image → "")', () => {
      const cart = mapCart(nullImageCartNode);
      expect(cart.lines[0].image).toBe('');
      expect(cart.lines[0].variantLabel).toBe('OS');
    });
  });
});
