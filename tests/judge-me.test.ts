import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `server-only` throws when imported outside Next's RSC compiler — mock it to
// an empty module so the client module loads under Vitest (same convention as
// the other lib tests).
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Judge.me client (lib/judge-me) — the read path behind the PDP Reviews
// disclosure. Contracts under test:
//   - NEVER throws: missing token / HTTP error / network failure all resolve
//     to { ok: false } with empty data (the disclosure renders its empty
//     state instead of breaking the page)
//   - filters reviews to the requested product handle (the index endpoint
//     returns reviews across products — cross-product leakage is a bug)
//   - summary math: thumbsUp = 5★ + 4★, thumbsDown = 1★ (2–3★ count toward
//     total/byRating only)
//   - ordering: 5★ → 1★, newest first inside a star band
//   - pagination: follows total_pages; responses cached for 5 minutes
// ---------------------------------------------------------------------------

const { getProductReviewData } = await import('@/lib/judge-me');

const TOKEN = 'jm_test_token';

function review(id: number, rating: number, handle = 'hoodie', createdAt = '2026-07-01T10:00:00.000Z') {
  return {
    id,
    rating,
    title: `Review ${id}`,
    body: `Body ${id}`,
    created_at: createdAt,
    product_handle: handle,
    reviewer: { name: `Buyer ${id}` },
  };
}

function page(reviews: unknown[], totalPages = 1) {
  return { reviews, total_pages: totalPages, current_page: 1, per_page: 100 };
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('JUDGE_ME_API_TOKEN', TOKEN);
  vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'aeipron.myshopify.com');
  mockFetch.mockResolvedValue({ ok: true, json: async () => page([]) });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('configuration failures', () => {
  it('returns ok:false without calling the network when the token is missing', async () => {
    vi.stubEnv('JUDGE_ME_API_TOKEN', '');
    const data = await getProductReviewData('hoodie');
    expect(data.ok).toBe(false);
    expect(data.reviews).toEqual([]);
    expect(data.summary.total).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns ok:false when no shop domain is configured', async () => {
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', '');
    vi.stubEnv('JUDGE_ME_SHOP_DOMAIN', '');
    const data = await getProductReviewData('hoodie');
    expect(data.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('API failures', () => {
  it('returns ok:false on an HTTP error (e.g. bad token → 401/422)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const data = await getProductReviewData('hoodie');
    expect(data.ok).toBe(false);
    expect(data.reviews).toEqual([]);
  });

  it('returns ok:false on a network error', async () => {
    mockFetch.mockRejectedValue(new Error('socket hangup'));
    const data = await getProductReviewData('hoodie');
    expect(data.ok).toBe(false);
  });
});

describe('filtering + summary math', () => {
  it('keeps only reviews for the requested product handle', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => page([review(1, 5, 'hoodie'), review(2, 5, 'pants'), review(3, 1, 'hoodie')]),
    });
    const data = await getProductReviewData('hoodie');
    expect(data.ok).toBe(true);
    expect(data.summary.total).toBe(2);
    expect(data.reviews.map((r) => r.id)).toEqual([1, 3]);
  });

  it('counts thumbsUp as 5★ + 4★ and thumbsDown as 1★ only', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () =>
        page([review(1, 5), review(2, 5), review(3, 4), review(4, 3), review(5, 2), review(6, 1)]),
    });
    const data = await getProductReviewData('hoodie');
    expect(data.summary.thumbsUp).toBe(3);
    expect(data.summary.thumbsDown).toBe(1);
    expect(data.summary.byRating).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 2 });
    expect(data.summary.total).toBe(6);
  });

  it('orders reviews 5★ → 1★, newest first inside a star band', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () =>
        page([
          review(1, 1),
          review(2, 5, 'hoodie', '2026-06-01T10:00:00.000Z'),
          review(3, 5, 'hoodie', '2026-07-10T10:00:00.000Z'),
          review(4, 3),
        ]),
    });
    const data = await getProductReviewData('hoodie');
    expect(data.reviews.map((r) => r.id)).toEqual([3, 2, 4, 1]);
  });

  it('normalizes reviewer names and tolerates missing fields', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => page([{ rating: 4, product_handle: 'hoodie' }]),
    });
    const data = await getProductReviewData('hoodie');
    expect(data.reviews[0].author).toBe('Verified buyer');
    expect(data.reviews[0].title).toBe('');
    expect(data.summary.thumbsUp).toBe(1);
  });
});

describe('pagination + caching', () => {
  it('follows total_pages and merges pages', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => page([review(1, 5)], 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => page([review(2, 2)], 2) });
    const data = await getProductReviewData('hoodie');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('page=1');
    expect(mockFetch.mock.calls[1][0]).toContain('page=2');
    expect(data.summary.total).toBe(2);
  });

  it('passes the shop domain + token and caches for 5 minutes', async () => {
    await getProductReviewData('hoodie');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('shop_domain=aeipron.myshopify.com');
    expect(url).toContain(`api_token=${TOKEN}`);
    expect(init).toEqual({ next: { revalidate: 300 } });
  });

  it('returns ok:true with an empty list when the product has no reviews', async () => {
    const data = await getProductReviewData('hoodie');
    expect(data.ok).toBe(true);
    expect(data.summary.total).toBe(0);
    expect(data.reviews).toEqual([]);
  });
});
