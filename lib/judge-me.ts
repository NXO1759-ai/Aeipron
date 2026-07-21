import 'server-only';

// ---------------------------------------------------------------------------
// Judge.me reviews — server-only read client for the product-page Reviews
// disclosure (lib + components/product/ReviewsSection).
//
// Two env vars (see .env.example):
//   JUDGE_ME_API_TOKEN   — Judge.me → Settings → Integrations → API token.
//   JUDGE_ME_SHOP_DOMAIN — defaults to SHOPIFY_STORE_DOMAIN (the domain the
//                          Judge.me app is bound to).
//
// Failure contract: this module NEVER throws into the page. A missing token,
// an auth error, an HTTP error, or malformed JSON all resolve to
// { ok: false, reviews: [], summary: EMPTY_SUMMARY } (logged server-side) and
// the disclosure renders its empty state. Reviews are read-only here — the
// storefront never writes to Judge.me.
//
// Caching: responses revalidate every 5 minutes (Next data cache), so a
// product page view does not hit Judge.me on every request.
// ---------------------------------------------------------------------------

const API_BASE = 'https://judge.me/api/v1';
const REVALIDATE_SECONDS = 300;
// Hard caps so a huge review history can never stall the page: at most
// MAX_PAGES × PER_PAGE reviews are read per product.
const PER_PAGE = 100;
const MAX_PAGES = 5;

export interface ProductReview {
  id: number;
  rating: number; // 1–5
  title: string;
  body: string;
  author: string;
  createdAt: string; // ISO date string from Judge.me
}

export interface ReviewSummary {
  total: number;
  byRating: Record<number, number>; // {1: n, 2: n, 3: n, 4: n, 5: n}
  /** 5★ + 4★ — what the thumbs-up counter shows. */
  thumbsUp: number;
  /** 1★ — what the thumbs-down counter shows. */
  thumbsDown: number;
}

export interface ProductReviewData {
  /** False when Judge.me is unconfigured or unreachable — UI shows empty state. */
  ok: boolean;
  summary: ReviewSummary;
  /** Reviews for THIS product only, best first (5★ → 1★, newest inside a band). */
  reviews: ProductReview[];
}

export const EMPTY_SUMMARY: ReviewSummary = {
  total: 0,
  byRating: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  thumbsUp: 0,
  thumbsDown: 0,
};

const EMPTY_DATA: ProductReviewData = { ok: false, summary: EMPTY_SUMMARY, reviews: [] };

/** Raw review shape from the Judge.me API (only the fields we read). */
interface JudgeMeApiReview {
  id?: number;
  rating?: number;
  title?: string;
  body?: string;
  created_at?: string;
  product_handle?: string;
  reviewer?: { name?: string };
}

interface JudgeMeApiPage {
  reviews?: JudgeMeApiReview[];
  total_pages?: number;
}

function summarize(reviews: ProductReview[]): ReviewSummary {
  const byRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 5) byRating[r.rating] += 1;
  }
  return {
    total: reviews.length,
    byRating,
    thumbsUp: byRating[5] + byRating[4],
    thumbsDown: byRating[1],
  };
}

async function fetchPage(
  shopDomain: string,
  token: string,
  page: number,
): Promise<JudgeMeApiPage | null> {
  const url = `${API_BASE}/reviews?shop_domain=${encodeURIComponent(shopDomain)}&api_token=${encodeURIComponent(
    token,
  )}&per_page=${PER_PAGE}&page=${page}`;
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) {
      console.error('[judge.me] reviews request failed with HTTP', res.status);
      return null;
    }
    return (await res.json()) as JudgeMeApiPage;
  } catch {
    console.error('[judge.me] reviews request failed: network error');
    return null;
  }
}

/**
 * Read all reviews for one product handle (paginated, capped) plus the
 * summary counters the thumbs UI needs. The Judge.me index endpoint returns
 * reviews across products, so filtering by `product_handle` happens here —
 * a review for another product can never leak onto the wrong page.
 */
export async function getProductReviewData(productHandle: string): Promise<ProductReviewData> {
  const token = process.env.JUDGE_ME_API_TOKEN;
  if (!token) {
    console.error('[judge.me] JUDGE_ME_API_TOKEN env var is not set');
    return EMPTY_DATA;
  }
  const shopDomain = process.env.JUDGE_ME_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN;
  if (!shopDomain) {
    console.error('[judge.me] no shop domain configured (JUDGE_ME_SHOP_DOMAIN / SHOPIFY_STORE_DOMAIN)');
    return EMPTY_DATA;
  }

  const collected: ProductReview[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await fetchPage(shopDomain, token, page);
    if (!data) return EMPTY_DATA;
    const batch = Array.isArray(data.reviews) ? data.reviews : [];
    for (const raw of batch) {
      if (raw.product_handle !== productHandle) continue;
      collected.push({
        id: raw.id ?? collected.length,
        rating: raw.rating ?? 0,
        title: raw.title ?? '',
        body: raw.body ?? '',
        author: raw.reviewer?.name ?? 'Verified buyer',
        createdAt: raw.created_at ?? '',
      });
    }
    const totalPages = typeof data.total_pages === 'number' ? data.total_pages : 1;
    if (page >= totalPages) break;
  }

  // Best-first ordering for the Details pop-up: 5★ → 1★, newest first within
  // a star band. Stable and total — the client renders this order verbatim.
  collected.sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));

  return { ok: true, summary: summarize(collected), reviews: collected };
}
