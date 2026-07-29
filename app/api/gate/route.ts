// ---------------------------------------------------------------------------
// POST /api/gate — verifies the access code against SITE_GATE_PASSWORD and,
// on a match, sets the httpOnly gate cookie that middleware.ts checks.
//
// Plain string comparison is intentional: this is a launch gate, not account
// auth, and the request/response round trip already dwarfs any timing signal.
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { GATE_COOKIE, gateToken } from '@/lib/gate';

export async function POST(request: Request) {
  const password = process.env.SITE_GATE_PASSWORD;
  if (!password) {
    // Gate disarmed — nothing to verify against.
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const attempt = (body as { password?: unknown })?.password;
  if (typeof attempt !== 'string' || attempt.length === 0 || attempt.length > 200) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (attempt !== password) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(GATE_COOKIE, await gateToken(password), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
