// ---------------------------------------------------------------------------
// Launch gate — locks every page behind an access code while the site is
// pre-launch. Armed ONLY when SITE_GATE_PASSWORD is set in the environment;
// when it's absent the middleware is a pass-through (the launch state).
//
// Requests without a valid gate cookie are redirected to /gate, which asks
// for the access code and posts it to /api/gate. The matcher below skips
// static assets, generated icons, robots/sitemap, and the gate itself.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { GATE_COOKIE, gateToken } from '@/lib/gate';

export async function middleware(request: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD;
  if (!password) return NextResponse.next(); // gate disarmed — site is open

  const cookie = request.cookies.get(GATE_COOKIE)?.value;
  if (cookie && cookie === (await gateToken(password))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const from = url.pathname + url.search;
  url.pathname = '/gate';
  url.search = `?from=${encodeURIComponent(from)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon|apple-icon|gate|api/gate).*)',
  ],
};
