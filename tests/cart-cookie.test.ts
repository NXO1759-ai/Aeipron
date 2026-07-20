import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Cart cookie helper tests.
//
// The helper wraps Next's `cookies()` store. These tests mock `next/headers`
// so no Next runtime is needed, and verify: the cookie NAME, the read
// pass-through (VERBATIM value), the write flags (httpOnly, secure-in-prod,
// sameSite=lax, path=/, 14-day maxAge), secure OFF in non-production, and
// delete. The `server-only` package is mocked away (it throws outside
// server components).
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

// Minimal in-memory cookie store mock.
const store = new Map<string, string>();
const setCalls: Record<string, unknown>[] = [];
const deleteCalls: string[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name) } : undefined),
    set: (opts: Record<string, unknown>) => {
      setCalls.push(opts);
      store.set(opts.name as string, opts.value as string);
    },
    delete: (name: string) => {
      deleteCalls.push(name);
      store.delete(name);
    },
  }),
}));

const { CART_COOKIE, getCartId, setCartId, clearCartId } = await import('@/lib/cart-cookie');

const CART_ID = 'gid://shopify/Cart/abc123?key=secret';

beforeEach(() => {
  store.clear();
  setCalls.length = 0;
  deleteCalls.length = 0;
  vi.unstubAllEnvs();
});

describe('cart-cookie name', () => {
  it('uses the brand cookie name', () => {
    expect(CART_COOKIE).toBe('apeiron-cart-id');
  });
});

describe('getCartId', () => {
  it('returns null when no cookie is set', async () => {
    await expect(getCartId()).resolves.toBeNull();
  });

  it('returns the stored value VERBATIM (never parsed or decoded)', async () => {
    store.set('apeiron-cart-id', CART_ID);
    await expect(getCartId()).resolves.toBe(CART_ID);
  });
});

describe('setCartId', () => {
  it('writes the id verbatim with httpOnly + lax + 14-day flags', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await setCartId(CART_ID);
    expect(setCalls).toEqual([
      {
        name: 'apeiron-cart-id',
        value: CART_ID,
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 14,
      },
    ]);
  });

  it('sets secure: false outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await setCartId(CART_ID);
    expect(setCalls[0].secure).toBe(false);
  });
});

describe('clearCartId', () => {
  it('deletes the cookie', async () => {
    store.set('apeiron-cart-id', CART_ID);
    await clearCartId();
    expect(deleteCalls).toContain('apeiron-cart-id');
    await expect(getCartId()).resolves.toBeNull();
  });
});
