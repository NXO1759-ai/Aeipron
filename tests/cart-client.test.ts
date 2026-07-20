import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shopify client dual-transport fallback tests.
//
// The client tries native Node `https` first and falls back to `curl` on a
// retryable network error. These tests mock `node:https` and
// `node:child_process` to drive the fallback decision without a network:
//   - a retryable error code (ECONNRESET)          → curl fallback used
//   - a request TIMEOUT                            → curl fallback used
//   - a non-retryable error (no code, not timeout) → throws, NO curl
//
// The timeout case is the production-critical one: the client's own
// `req.setTimeout` handler must produce an error the routing logic treats as
// retryable, otherwise a slow Shopify route silently fails instead of falling
// back to curl. (This was a latent bug — the timeout Error had no `.code` —
// surfaced by the live cart smoke on the slow sandbox route.)
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

// https mock: a queued error + captured handlers. `__setError(e)` makes the
// NEXT request emit `e` when `end()` is called (simulating a network failure
// on the real request shopifyRequest creates internally). `__fireTimeout()`
// fires the client's own setTimeout handler on the current pending request —
// exercising the real timeout→destroy→routing code path.
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
// callback) and passes the token + body over the child's stdin (`--config -`)
// instead of argv. The mock captures the stdin writes so tests can assert the
// secrets travel over the pipe and NOT the argument list.
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
      cb(null, '{"data":{"shop":{"name":"Apeiron"}}}', '');
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

const { shopifyRequest } = await import('@/lib/shopify/client');
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
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'test-token';
});

describe('shopifyRequest dual-transport fallback', () => {
  it('throws immediately with NO curl fallback on a non-retryable error (no code, not a timeout)', async () => {
    // A plain Error with no code is non-retryable → surface immediately, no curl.
    https.__setError(new Error('something broke'));
    await expect(shopifyRequest('{ shop { name } }')).rejects.toThrow();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('falls back to curl when the native https request TIMES OUT (the production-critical case)', async () => {
    // Start the request (returns a promise that is pending until the timeout fires).
    const p = shopifyRequest('{ shop { name } }');
    // Fire the client's own setTimeout handler — simulating HTTPS_TIMEOUT_MS elapsing.
    https.__fireTimeout();
    // The timeout must route to the curl fallback (not throw a network error).
    await expect(p).resolves.toEqual({ shop: { name: 'Apeiron' } });
    expect(mockExecFile).toHaveBeenCalled();
  });

  it('falls back to curl on a retryable network error code (ECONNRESET)', async () => {
    const err = new Error('connection reset') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    https.__setError(err);
    await expect(shopifyRequest('{ shop { name } }')).resolves.toEqual({ shop: { name: 'Apeiron' } });
    expect(mockExecFile).toHaveBeenCalled();
  });

  it('curl fallback sends the token + body over STDIN, never the argument list', async () => {
    const err = new Error('connection reset') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    https.__setError(err);
    await shopifyRequest('{ shop { name } }');
    const args = mockExecFile.mock.calls[0];
    const flags = args[1] as string[];
    expect(args[0]).toBe('curl');
    expect(flags).toContain('-X');
    expect(flags).toContain('POST');
    expect(flags).toContain('Content-Type: application/json');
    expect(flags).toContain('--fail');
    // SECURITY: no flag may contain the token or the GraphQL body — argv is
    // world-readable via /proc / ps on the host.
    expect(flags.some((f) => f.includes('test-token'))).toBe(false);
    expect(flags.some((f) => f.includes('{ shop { name } }'))).toBe(false);
    // The token + body travel over stdin (the `--config -` pipe) instead.
    expect(flags).toContain('--config');
    const stdin = childProc.stdinChunks.join('');
    expect(stdin).toContain('X-Shopify-Storefront-Access-Token: test-token');
    expect(stdin).toContain('{ shop { name } }');
  });
});
