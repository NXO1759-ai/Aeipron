// ---------------------------------------------------------------------------
// Launch gate — shared helpers for the pre-launch access-code wall.
//
// The gate is armed by the SITE_GATE_PASSWORD environment variable:
//   · SET   → every page requires the access code (proxy.ts redirects
//             to /gate; /api/gate verifies the code and sets the cookie).
//   · UNSET → the site is fully open. Launch day = delete the env var in
//             Vercel and redeploy; no code change needed.
//
// The cookie never stores the password itself — only SHA-256 of a salted
// string — so the browser never holds the secret. Web Crypto is used because
// it runs in BOTH the proxy runtime (Node.js, where crypto.subtle is a
// global) and route handlers.
// ---------------------------------------------------------------------------

export const GATE_COOKIE = '__Host-apeiron_gate';

/** SHA-256 hex of the salted password — the value stored in the gate cookie. */
export async function gateToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`apeiron-gate:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
