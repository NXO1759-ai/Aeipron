import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shopify Admin client dual-transport fallback tests.
//
// Mirrors tests/cart-client.test.ts (the Storefront client) for the Admin
// client: native Node `https` first, `curl` fallback on a retryable network
// error. These tests mock `node:https` and `node:child_process` to drive the
// fallback decision without a network:
//   - a retryable error code (ECONNRESET)          → curl fallback used
//   - a request TIMEOUT                            → curl fallback used
//   - a non-retryable error (no code, not timeout) → throws, NO curl
//
// Plus Admin-specific assertions: the correct endpoint path
// (/admin/api/<version>/graphql.json) and the `X-Shopify-Access-Token` header
// (NOT the Storefront `X-Shopify-Storefront-Access-Token`).
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

vi.mock('node:https', () => {
  let pendingError: Error | null = null;
  let onError: ((e: Error) => void) | null = null;
  let timeoutCb: (() => void) | null = null;
  const request = vi.fn(() => ({
    setTimeout: (_ms: number, cb: () => void) => {
      timeoutCb = cb;
    },
    on: (ev: string, fn: (e: Error) => void) => {
      if (ev === 'error') onError = fn;
    },
    write: () => {},
    end: () => {
      if (pendingError && onError) {
        const e = pendingError;
        pendingError = null;
        onError(e);
      }
    },
    destroy: (e: Error) => {
      if (onError) onError(e);
    },
  }));
  const api = {
    request,
    __setError: (e: Error) => {
      pendingError = e;
    },
    __fireTimeout: () => timeoutCb?.(),
  };
  return { default: api, ...api };
});

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => '{"data":{"metaobjectCreate":{"userErrors":[]}}}'),
}));

const { adminRequest } = await import('@/lib/shopify/admin-client');
const https = (await import('node:https')) as unknown as {
  __setError: (e: Error) => void;
  __fireTimeout: () => void;
};
const { execFileSync } = await import('node:child_process');

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
  process.env.SHOPIFY_API_VERSION = '2025-07';
  process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN = 'shpat_test_admin_token';
});

describe('adminRequest dual-transport fallback', () => {
  it('throws immediately with NO curl fallback on a non-retryable error (no code, not a timeout)', async () => {
    https.__setError(new Error('something broke'));
    await expect(adminRequest('{ shop { name } }')).rejects.toThrow();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('falls back to curl when the native https request TIMES OUT', async () => {
    const p = adminRequest('{ shop { name } }');
    https.__fireTimeout();
    await expect(p).resolves.toEqual({ metaobjectCreate: { userErrors: [] } });
    expect(mockExecFileSync).toHaveBeenCalled();
  });

  it('falls back to curl on a retryable network error code (ECONNRESET)', async () => {
    const err = new Error('connection reset') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    https.__setError(err);
    await expect(adminRequest('{ shop { name } }')).resolves.toEqual({
      metaobjectCreate: { userErrors: [] },
    });
    expect(mockExecFileSync).toHaveBeenCalled();
  });

  it('curl fallback targets the Admin API endpoint + uses the Admin access-token header', async () => {
    const err = new Error('connection reset') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    https.__setError(err);
    await adminRequest('{ shop { name } }');
    const args = mockExecFileSync.mock.calls[0];
    const flags = args[1] as string[];
    expect(args[0]).toBe('curl');
    // Admin endpoint path (NOT the Storefront /api/<ver>/graphql.json).
    expect(flags).toContain('https://test.myshopify.com/admin/api/2025-07/graphql.json');
    // Admin auth header (NOT X-Shopify-Storefront-Access-Token).
    expect(flags).toContain('X-Shopify-Access-Token: shpat_test_admin_token');
    expect(flags).not.toContain('X-Shopify-Storefront-Access-Token: shpat_test_admin_token');
    expect(flags).toContain('Content-Type: application/json');
    const bodyIdx = flags.indexOf('-d');
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(flags[bodyIdx + 1]).toContain('{ shop { name } }');
  });
});