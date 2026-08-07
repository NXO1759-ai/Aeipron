// ---------------------------------------------------------------------------
// Proxy — Next.js 16's renamed request-interception hook (formerly
// "middleware"). Runs on the Node.js runtime; Web Crypto and `btoa` are
// globals there (Node 20+), so the gate hashing and nonce generation below
// work unchanged. Two concerns, applied to every matched request:
//
// 1. CONTENT SECURITY POLICY. Enforced in production, report-only in
//    development (so HMR / React refresh are never broken locally).
//
//    The policy is SPLIT by render mode, because per-request nonces are only
//    possible when the HTML is rendered per request:
//
//    · DYNAMIC routes (server-rendered per request — cart, checkout, review,
//      product/collection/collaborator detail, /api/*) get the STRICT policy:
//      `script-src 'self' 'nonce-<fresh>' …`. The nonce is generated per
//      request and forwarded as a `Content-Security-Policy` REQUEST header so
//      Next.js stamps it onto its inline hydration/bootstrap scripts during
//      SSR (the documented nonce mechanism). Any inline script without the
//      nonce is blocked.
//
//    · STATIC / ISR routes (cached HTML — home, shop, story, help, contact,
//      gate, catalog lists) get the LENIENT policy:
//      `script-src 'self' 'unsafe-inline' …`. A per-request nonce can NEVER
//      match cached HTML: the cached page was rendered once (at build or
//      revalidation time) and is then served to many requests, each with a
//      different nonce — enforcing a nonce there breaks hydration for every
//      visitor after the first. (CSP3 also ignores 'unsafe-inline' when a
//      nonce is present in the policy, so the lenient policy must contain NO
//      'nonce-' source.) For the same reason the nonce request header is
//      forwarded ONLY on dynamic routes — otherwise an ISR cache-miss render
//      would bake one request's nonce into HTML served to everyone else.
//
//    The strict-path list mirrors the route render modes from `next build`
//    (ƒ = dynamic, ○ = static/ISR). If a route's render mode changes, update
//    `isDynamicRoute` — the default is the LENIENT policy (degrades
//    security, never breaks the page). All other directives are identical
//    and stay strict on every route (object-src 'none', frame-ancestors
//    'none', base-uri 'self', …). This header replaces the static
//    report-only CSP that used to live in next.config.ts — that one could
//    never be enforced safely because `script-src 'self'` (no nonce) blocks
//    Next's inline bootstrap scripts.
//
// 2. LAUNCH GATE — locks every page behind an access code while the site is
//    pre-launch. Armed ONLY when SITE_GATE_PASSWORD is set in the
//    environment; when it's absent the gate is a pass-through (the launch
//    state). Requests without a valid gate cookie are redirected to /gate,
//    which asks for the access code and posts it to /api/gate.
//
// The matcher below skips static assets, generated icons, and robots/sitemap.
// The gate paths (/gate, /api/gate) are matched (so they get the CSP) but
// excluded from the redirect logic to avoid a redirect loop.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { GATE_COOKIE, gateToken } from '@/lib/gate';

const isDev = process.env.NODE_ENV === 'development';

/**
 * True for routes that are server-rendered per request (ƒ in the `next
 * build` output) and can therefore carry a per-request script nonce.
 * Everything else — static prerender and ISR — is served from cached HTML
 * and must use the lenient policy. Keep in sync with route render modes.
 */
function isDynamicRoute(pathname: string): boolean {
  return (
    pathname === '/cart' ||
    pathname === '/checkout' ||
    pathname === '/review' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/product/') ||
    (pathname.startsWith('/collection/') && pathname !== '/collection') ||
    (pathname.startsWith('/collaborators/') && pathname !== '/collaborators')
  );
}

/** Build the CSP. `nonce` is set only on dynamic routes (see header notes). */
function buildCsp(nonce: string | null): string {
  const scriptSrc = nonce
    ? // Dynamic route: strict — only nonced inline scripts + allowlisted hosts.
      `'self' 'nonce-${nonce}' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ''}`
    : // Static/ISR route: cached HTML can never match a per-request nonce.
      `'self' 'unsafe-inline' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ''}`;
  return [
    "default-src 'self'",
    // next/image data: placeholders + Shopify CDN product imagery.
    "img-src 'self' https://cdn.shopify.com data:",
    // Next inline styles + motion inline transforms require 'unsafe-inline'.
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    `connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com${isDev ? ' ws:' : ''}`,
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** 128-bit random nonce, base64 — Web Crypto + btoa (globals in the Node runtime). */
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const dynamic = isDynamicRoute(pathname);
  const nonce = dynamic ? generateNonce() : null;
  const csp = buildCsp(nonce);

  // Forward the nonce-bearing CSP as a request header on DYNAMIC routes only:
  // Next.js reads the nonce from it during SSR and applies it to framework
  // inline scripts. On static/ISR routes it must NOT be forwarded — an ISR
  // cache-miss render would embed one request's nonce into cached HTML.
  const requestHeaders = new Headers(request.headers);
  if (nonce) requestHeaders.set('Content-Security-Policy', csp);

  // --- Launch gate ---
  const password = process.env.SITE_GATE_PASSWORD;
  const isGatePath = pathname === '/gate' || pathname.startsWith('/api/gate');

  if (password && !isGatePath) {
    const cookie = request.cookies.get(GATE_COOKIE)?.value;
    if (!cookie || cookie !== (await gateToken(password))) {
      const url = request.nextUrl.clone();
      const from = pathname + request.nextUrl.search;
      url.pathname = '/gate';
      url.search = `?from=${encodeURIComponent(from)}`;
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Enforced in production; report-only in dev so HMR is never blocked.
  response.headers.set(
    isDev ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    csp,
  );
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon|apple-icon).*)',
  ],
};
