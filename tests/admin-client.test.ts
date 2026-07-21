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
// (NOT the Storefront `X-Shopify-Storefront-Access-Token`) — sent over stdin,
// never argv, after the hardening.
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

// child_process mock: the hardened curl fallback is ASYNC (execFile with a
// callback) and passes the Admin token + body over the child's stdin
// (`--config -`) instead of argv. The mock captures the stdin writes so tests
// can assert the secrets travel over the pipe and NOT the argument list.
const childProc = vi.hoisted(() => ({
  stdinChunks: [] as string[],
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, '{"data":{"metaobjectCreate":{"userErrors":[]}}}', '');
      return {
        stdin: {
          write: (chunk: string) => {
            childProc.stdinChunks.push(chunk);
          },
          end: () => {},
        },
      };
    },
  ),
}));

const { adminRequest } = await import('@/lib/shopify/admin-client');
const https = (await import('node:https')) as unknown as {
  __setError: (e: Error) => void;
  __fireTimeout: () => void;
};
const { execFile } = await import('node:child_process');

const mockExecFile = vi.mocked(execFile);

beforeEach(() => {
  vi.clearAllMocks();
  childProc.stdinChunks.length = 0;
  process.env.SHOPIFY_STORE_DOMAIN = 'test.myshopify.com';
  process.env.SHOPIFY_API_VERSION = '2025-07';
  process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN = 'shpat_test_admin_token';
});

describe('adminRequest dual-transport fallback', () => {
  it('throws immediately with NO curl fallback on a non-retryable error (no code, not a timeout)', async () => {
    https.__setError(new Error('something broke'));
    await expect(adminRequest('{ shop { name } }')).rejects.toThrow();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('falls back to curl when the native https request TIMES OUT', async () => {
    const p = adminRequest('{ shop { name } }');
    https.__fireTimeout();
    await expect(p).resolves.toEqual({ metaobjectCreate: { userErrors: [] } });
    expect(mockExecFile).toHaveBeenCalled();
  });

  it('falls back to curl on a retryable network error code (ECONNRESET)', async () => {
    const err = new Error('connection reset') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    https.__setError(err);
    await expect(adminRequest('{ shop { name } }')).resolves.toEqual({
      metaobjectCreate: { userErrors: [] },
    });
    expect(mockExecFile).toHaveBeenCalled();
  });

  it('curl fallback targets the Admin API endpoint + keeps the Admin token OUT of argv', async () => {
    const err = new Error('connection reset') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    https.__setError(err);
    await adminRequest('{ shop { name } }');
    const args = mockExecFile.mock.calls[0];
    const flags = args[1] as string[];
    expect(args[0]).toBe('curl');
    // Admin endpoint path (NOT the Storefront /api/<ver>/graphql.json).
    expect(flags).toContain('https://test.myshopify.com/admin/api/2025-07/graphql.json');
    expect(flags).toContain('Content-Type: application/json');
    expect(flags).toContain('--fail');
    // SECURITY: the Admin token (write access to the store) and the GraphQL
    // body must NEVER appear in the argument list (world-readable via /proc).
    expect(flags.some((f) => f.includes('shpat_test_admin_token'))).toBe(false);
    expect(flags.some((f) => f.includes('{ shop { name } }'))).toBe(false);
    // They travel over stdin (the `--config -` pipe) instead, with the ADMIN
    // header name (NOT X-Shopify-Storefront-Access-Token).
    expect(flags).toContain('--config');
    const stdin = childProc.stdinChunks.join('');
    expect(stdin).toContain('X-Shopify-Access-Token: shpat_test_admin_token');
    expect(stdin).not.toContain('X-Shopify-Storefront-Access-Token');
    expect(stdin).toContain('{ shop { name } }');
  });
});
