import { describe, it, expect, beforeEach, vi } from 'vitest';

// lib/shipping-protection/index.ts imports 'server-only' + shopifyRequest.
// Mock both so the content reader can be driven with synthetic Storefront
// responses (no live Shopify, no token).
vi.mock('server-only', () => ({}));
vi.mock('@/lib/shopify/client', () => ({
  shopifyRequest: vi.fn(),
}));

import { shopifyRequest } from '@/lib/shopify/client';
import {
  getShippingProtectionContent,
  getProtectionConfig,
  normalizeProtectionRate,
  getProtectionRate,
  __resetProtectionProductCacheForTests,
} from '@/lib/shipping-protection';
import { DEFAULT_PROTECTION_CONTENT } from '@/lib/shipping-protection/types';
import { SHIPPING_PROTECTION_CONTENT_QUERY } from '@/lib/shopify/queries';

const mockRequest = vi.mocked(shopifyRequest);

/** Build a Storefront `metaobject` response with the given field key/value strings. */
function metaobjectResponse(fields: Record<string, string>) {
  return {
    metaobject: {
      handle: 'default',
      fields: Object.entries(fields).map(([key, value]) => ({ key, value })),
    },
  };
}

describe('normalizeProtectionRate', () => {
  it('accepts a decimal (0.01)', () => {
    expect(normalizeProtectionRate('0.01')).toBe(0.01);
  });
  it('accepts a whole percent (1) and normalizes to a decimal', () => {
    expect(normalizeProtectionRate('1')).toBe(0.01);
  });
  it('accepts a trailing % sign (1%)', () => {
    expect(normalizeProtectionRate('1%')).toBe(0.01);
  });
  it('accepts a decimal percent (0.02) and a whole percent (2)', () => {
    expect(normalizeProtectionRate('0.02')).toBe(0.02);
    expect(normalizeProtectionRate('2')).toBe(0.02);
  });
  it('returns null for blank / unparsable / negative', () => {
    expect(normalizeProtectionRate('')).toBeNull();
    expect(normalizeProtectionRate('   ')).toBeNull();
    expect(normalizeProtectionRate(undefined)).toBeNull();
    expect(normalizeProtectionRate('abc')).toBeNull();
    expect(normalizeProtectionRate('-1')).toBeNull();
  });
});

describe('getProtectionRate (env fallback)', () => {
  beforeEach(() => {
    delete process.env.CAPTAIN_PROTECTION_RATE;
  });

  it('falls back to 1% (the client-confirmed default) when the env is unset', () => {
    expect(getProtectionRate()).toBe(0.01);
  });
  it('reads the env var when set (decimal or whole percent)', () => {
    process.env.CAPTAIN_PROTECTION_RATE = '0.03';
    expect(getProtectionRate()).toBe(0.03);
    process.env.CAPTAIN_PROTECTION_RATE = '3';
    expect(getProtectionRate()).toBe(0.03);
  });
  it('falls back to 1% when the env is unparsable', () => {
    process.env.CAPTAIN_PROTECTION_RATE = 'not-a-number';
    expect(getProtectionRate()).toBe(0.01);
  });
});

describe('getShippingProtectionContent', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('parses the metaobject fields into ProtectionContent', async () => {
    mockRequest.mockResolvedValueOnce(
      metaobjectResponse({
        label_on: 'Keep protection',
        label_off: 'Add coverage',
        description: 'Custom description edited in Shopify Admin.',
        rate: '0.03',
        enabled: 'true',
      }),
    );
    const content = await getShippingProtectionContent();
    expect(content).toEqual({
      labelOn: 'Keep protection',
      labelOff: 'Add coverage',
      description: 'Custom description edited in Shopify Admin.',
      rate: 0.03,
      enabled: true,
    });
  });

  it('parses a whole-percent rate string (1 → 0.01)', async () => {
    mockRequest.mockResolvedValueOnce(metaobjectResponse({ rate: '1', enabled: 'true' }));
    const content = await getShippingProtectionContent();
    expect(content?.rate).toBe(0.01);
  });

  it('treats enabled "false" as disabled', async () => {
    mockRequest.mockResolvedValueOnce(metaobjectResponse({ enabled: 'false' }));
    const content = await getShippingProtectionContent();
    expect(content?.enabled).toBe(false);
  });

  it('treats a blank enabled field as enabled (a partial entry never disables)', async () => {
    mockRequest.mockResolvedValueOnce(metaobjectResponse({ enabled: '' }));
    const content = await getShippingProtectionContent();
    expect(content?.enabled).toBe(true);
  });

  it('falls back to DEFAULT_PROTECTION_CONTENT copy when a field is blank', async () => {
    mockRequest.mockResolvedValueOnce(metaobjectResponse({ enabled: 'true' }));
    const content = await getShippingProtectionContent();
    expect(content?.labelOn).toBe(DEFAULT_PROTECTION_CONTENT.labelOn);
    expect(content?.labelOff).toBe(DEFAULT_PROTECTION_CONTENT.labelOff);
    expect(content?.description).toBe(DEFAULT_PROTECTION_CONTENT.description);
    expect(content?.rate).toBeNull(); // blank rate → null → getProtectionConfig uses env
  });

  it('returns null when the metaobject is not storefront-visible / missing', async () => {
    mockRequest.mockResolvedValueOnce({ metaobject: null });
    const content = await getShippingProtectionContent();
    expect(content).toBeNull();
  });

  it('queries the content metaobject by handle (handle + type)', async () => {
    mockRequest.mockResolvedValueOnce(metaobjectResponse({ enabled: 'true' }));
    await getShippingProtectionContent();
    expect(mockRequest).toHaveBeenCalledWith(SHIPPING_PROTECTION_CONTENT_QUERY, {
      handle: { handle: 'default', type: 'shipping_protection_content' },
    });
  });
});

describe('getProtectionConfig rate resolution', () => {
  // getProtectionConfig also fetches the product (memoized). Mock it to return a
  // minimal product so the function proceeds to the content/rate logic.
  const productResponse = {
    product: {
      id: 'gid://shopify/Product/1',
      handle: 'shipping-protection',
      title: 'Shipping Protection',
      variants: {
        nodes: [
          { id: 'gid://shopify/ProductVariant/1', title: '1.00', availableForSale: true, price: { amount: '1.00', currencyCode: 'USD' } },
          { id: 'gid://shopify/ProductVariant/2', title: '2.01', availableForSale: true, price: { amount: '2.01', currencyCode: 'USD' } },
        ],
      },
    },
  };

  beforeEach(() => {
    mockRequest.mockReset();
    __resetProtectionProductCacheForTests();
    delete process.env.CAPTAIN_PROTECTION_RATE;
  });

  it('uses the metaobject rate when set (takes precedence over env)', async () => {
    // First call → product; second call → content (rate 0.03).
    mockRequest.mockResolvedValueOnce(productResponse);
    mockRequest.mockResolvedValueOnce(metaobjectResponse({ rate: '0.03', enabled: 'true' }));
    const cfg = await getProtectionConfig();
    expect(cfg?.rate).toBe(0.03);
    expect(cfg?.content.rate).toBe(0.03);
  });

  it('falls back to the env rate when the metaobject rate is blank', async () => {
    process.env.CAPTAIN_PROTECTION_RATE = '0.02';
    mockRequest.mockResolvedValueOnce(productResponse);
    mockRequest.mockResolvedValueOnce(metaobjectResponse({ enabled: 'true' }));
    const cfg = await getProtectionConfig();
    expect(cfg?.rate).toBe(0.02); // env fallback
    expect(cfg?.content.rate).toBeNull();
  });

  it('falls back to the 1% default when both metaobject + env are absent', async () => {
    mockRequest.mockResolvedValueOnce(productResponse);
    mockRequest.mockResolvedValueOnce(metaobjectResponse({ enabled: 'true' }));
    const cfg = await getProtectionConfig();
    expect(cfg?.rate).toBe(0.01);
  });

  it('falls back to DEFAULT_PROTECTION_CONTENT when the content metaobject is missing', async () => {
    mockRequest.mockResolvedValueOnce(productResponse);
    mockRequest.mockResolvedValueOnce({ metaobject: null });
    const cfg = await getProtectionConfig();
    expect(cfg?.content).toEqual(DEFAULT_PROTECTION_CONTENT);
  });

  it('falls back to DEFAULT_PROTECTION_CONTENT when the content fetch throws (non-fatal)', async () => {
    mockRequest.mockResolvedValueOnce(productResponse);
    mockRequest.mockRejectedValueOnce(new Error('network'));
    const cfg = await getProtectionConfig();
    expect(cfg?.content).toEqual(DEFAULT_PROTECTION_CONTENT);
  });
});