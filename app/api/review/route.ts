// ---------------------------------------------------------------------------
// POST /api/review — submits a product review to Judge.me.
//
// Judge.me's create endpoint (POST https://judge.me/api/v1/reviews) is the
// PUBLIC web-review endpoint — per the Judge.me API docs it works like the
// public form on product pages and takes NO api_token (the read client in
// lib/judge-me.ts is the only place the token is used). It creates nothing
// if the store has web reviews disabled in Judge.me settings.
//
// Product identity: Judge.me wants the EXTERNAL Shopify numeric product ID
// (`id` in the payload) — resolved server-side by lib/review-products and
// sent by the client as `productId`. Without it the review would land as a
// shop-level review, so it is required here, never optional.
//
// Abuse surface: the form includes a honeypot (`company`) — bots that fill
// it get a fake success so nothing reaches Judge.me. `reviewer_name_format:
// 'last_initial'` shows "John S." publicly instead of full names.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const input = body as {
    productId?: unknown;
    rating?: unknown;
    title?: unknown;
    review?: unknown;
    name?: unknown;
    email?: unknown;
    company?: unknown; // honeypot — must stay empty
  };

  // Honeypot tripped — pretend it worked, send nothing upstream.
  if (typeof input.company === 'string' && input.company.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const productId = Number(input.productId);
  const rating = Number(input.rating);
  const review = typeof input.review === 'string' ? input.review.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';

  const valid =
    Number.isInteger(productId) &&
    productId > 0 &&
    Number.isInteger(rating) &&
    rating >= 1 &&
    rating <= 5 &&
    review.length >= 1 &&
    review.length <= 5000 &&
    name.length >= 1 &&
    name.length <= 100 &&
    title.length <= 200 &&
    EMAIL_RE.test(email);
  if (!valid) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const shopDomain = process.env.JUDGE_ME_SHOP_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN;
  if (!shopDomain) {
    console.error('[review] no shop domain configured (JUDGE_ME_SHOP_DOMAIN / SHOPIFY_STORE_DOMAIN)');
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  // Judge.me uses the reviewer's IP for the review's location; forward the
  // real client IP (Vercel sets x-forwarded-for) instead of the server's.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  const payload: Record<string, unknown> = {
    shop_domain: shopDomain,
    platform: 'shopify',
    id: productId,
    name,
    email,
    rating,
    body: review,
    reviewer_name_format: 'last_initial',
  };
  if (title) payload.title = title;
  if (ip) payload.ip_addr = ip;

  try {
    const res = await fetch('https://judge.me/api/v1/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[review] Judge.me create failed with HTTP', res.status);
      return NextResponse.json({ ok: false }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    console.error('[review] Judge.me create failed: network error');
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
