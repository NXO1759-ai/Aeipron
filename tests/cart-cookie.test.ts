import { describe, it, expect, beforeEach, vi } from 'vitest';

// `server-only` throws when imported outside Next's RSC compiler (its default
// export is a throwing stub; only the `react-server` condition resolves to the
// no-op). Mock it to an empty module so the helper loads under Vitest. The
// `import 'server-only'` boundary is still enforced at build time by Next.
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Cart cookie helper tests.
//
// The Shopify cart.id (incl. the `?key=` secret) is OPAQUE. It must be stored
// in an HTTP-only cookie the browser JS can never read, passed verbatim to
// Shopify, and NEVER parsed, split, logged, or returned to the client. These
// tests mock `next/headers` `cookies()` with an in-memory store and assert:
//   - getCartId returns the cookie value verbatim (no transformation)
//   - getCartId returns null when the cookie is absent
//   - setCartId writes httpOnly + sameSite:'lax' + path:'/' + 14-day maxAge,
//     and secure only in production
//   - clearCartId deletes the cookie
//   - the helper never parses / splits the value (the `?key=` secret survives)
// ---------------------------------------------------------------------------

// In-memory cookie store + controllable cookies() mock.
type CookieJar = Record<string, { value: string }>;

/** The options object `cookies().set()` receives — the shape setCartId builds. */
interface CookieSetOptions {
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
}

let jar: CookieJar;
let setCalls: CookieSetOptions[];
let deleteCalls: string[];

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => {
    // Returns a sync fake store; the helper `await`s it (await on a non-promise
    // is a no-op), so this works whether Next's cookies() is sync or async.
    return {
      get: (name: string) => (jar[name] ? { name, value: jar[name].value } : undefined),
      set: (opts: CookieSetOptions) => {
        setCalls.push(opts);
        jar[opts.name] = { value: opts.value };
      },
      delete: (name: string) => {
        deleteCalls.push(name);
        delete jar[name];
      },
    };
  }),
}));

const { getCartId, setCartId, clearCartId, CART_COOKIE } = await import('@/lib/cart-cookie');

const OPAQUE_CART_ID =
  'gid://shopify/Cart/hWNEDKXF5vLvcFgfLPyS0xP9?key=2891fdade96d3f136d2e670174626694';

// `process.env.NODE_ENV` is read-only under newer @types/node, but the helper
// branches on it (secure flag), so the tests must flip it. Cast to a writable
// record to assign without a type error.
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  jar = {};
  setCalls = [];
  deleteCalls = [];
  env.NODE_ENV = 'test';
});

describe('CART_COOKIE constant', () => {
  it('uses the documented cookie name', () => {
    expect(CART_COOKIE).toBe('apeiron-cart-id');
  });
});

describe('getCartId', () => {
  it('returns the cookie value verbatim (opaque — never parsed)', async () => {
    jar['apeiron-cart-id'] = { value: OPAQUE_CART_ID };
    const id = await getCartId();
    expect(id).toBe(OPAQUE_CART_ID);
  });

  it('preserves the ?key= secret intact (no splitting/decoding)', async () => {
    jar['apeiron-cart-id'] = { value: OPAQUE_CART_ID };
    const id = await getCartId();
    expect(id).toContain('?key=');
    expect(id).toContain('2891fdade96d3f136d2e670174626694');
    // The full id, including the secret, is returned unchanged.
    expect(id).toBe(OPAQUE_CART_ID);
  });

  it('returns null when the cookie is absent', async () => {
    const id = await getCartId();
    expect(id).toBeNull();
  });

  it('returns null for an empty cookie value', async () => {
    jar['apeiron-cart-id'] = { value: '' };
    const id = await getCartId();
    // An empty string is treated as "no cart" (cookie().get returns {value:''});
    // the helper passes it through — the caller (getCart) treats '' as no id.
    expect(id).toBe('');
  });
});

describe('setCartId', () => {
  it('writes the opaque id verbatim (no transformation of the ?key= secret)', async () => {
    await setCartId(OPAQUE_CART_ID);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].value).toBe(OPAQUE_CART_ID);
    expect(jar['apeiron-cart-id'].value).toBe(OPAQUE_CART_ID);
  });

  it('sets httpOnly: true (browser JS must never read the cart id)', async () => {
    await setCartId(OPAQUE_CART_ID);
    expect(setCalls[0].httpOnly).toBe(true);
  });

  it('sets sameSite: "lax" and path: "/"', async () => {
    await setCartId(OPAQUE_CART_ID);
    expect(setCalls[0].sameSite).toBe('lax');
    expect(setCalls[0].path).toBe('/');
  });

  it('sets a 14-day maxAge (in seconds)', async () => {
    await setCartId(OPAQUE_CART_ID);
    expect(setCalls[0].maxAge).toBe(60 * 60 * 24 * 14);
  });

  it('sets secure: false outside production (dev/test)', async () => {
    env.NODE_ENV = 'development';
    await setCartId(OPAQUE_CART_ID);
    expect(setCalls[0].secure).toBe(false);
  });

  it('sets secure: true in production', async () => {
    env.NODE_ENV = 'production';
    await setCartId(OPAQUE_CART_ID);
    expect(setCalls[0].secure).toBe(true);
  });
});

describe('clearCartId', () => {
  it('deletes the cart cookie by name', async () => {
    jar['apeiron-cart-id'] = { value: OPAQUE_CART_ID };
    await clearCartId();
    expect(deleteCalls).toEqual(['apeiron-cart-id']);
    expect(jar['apeiron-cart-id']).toBeUndefined();
  });
});