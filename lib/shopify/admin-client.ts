// ---------------------------------------------------------------------------
// Shopify Admin API GraphQL client — the single server-only entry point for
// headless writes to Shopify (the Storefront API is read-only for content /
// metaobjects, and the storefront `/contact` POST endpoint is behind
// Cloudflare bot management + Shopify storefront-form captcha, both of which
// block server-side and cross-origin browser submissions).
//
// The Admin API lives on `/admin/api/{version}/graphql.json`, authenticates
// with the `X-Shopify-Access-Token` request header (NOT the Storefront
// token), and — critically — is NOT behind the storefront Cloudflare
// challenge or the storefront-form captcha. A server-side request to it with a
// valid Admin token succeeds (verified live: an unauthenticated probe returns
// a clean 401 "Invalid API key or access token", not a Cloudflare challenge).
//
// DO NOT import this file from any component marked 'use client'. The
// `import 'server-only'` line makes any client import fail at build time —
// importing it from a client component would ship the Admin access token to
// the browser bundle, which is far more powerful than the Storefront token
// (it can write store data). Only server actions / server components /
// route handlers may call `adminRequest`.
//
// SECURITY: the Admin token is read from `SHOPIFY_ADMIN_API_ACCESS_TOKEN`
// and MUST be a server-only env var (`.env.local` is gitignored). Never log
// it, never return it, never expose it to the client.
//
// Transport: mirrors `lib/shopify/client.ts` (the Storefront client) — tries
// Node's native `https` first (fast in production environments like Vercel),
// and falls back to `curl` as a child process on a retryable network error.
// curl uses its own DNS resolver + TLS stack (libcurl + OpenSSL), which is
// more reliable in environments where Node's networking is restricted (the
// reason the Storefront client has the same fallback). The curl fallback
// includes built-in retry (--retry 3) and a hard timeout.
//
// Curl fallback hardening (mirrors lib/shopify/client.ts):
//   - Runs ASYNCHRONOUSLY (execFile, not execFileSync) so a slow Shopify edge
//     can never block the Node event loop for every in-flight request on the
//     instance.
//   - The Admin token (far more powerful than the Storefront token — it can
//     WRITE store data) and the request body travel over the child's stdin
//     (`--config -`), NEVER the argument list, so nothing can scrape them
//     from /proc or `ps`.
//   - `--fail` makes curl exit non-zero on HTTP errors, so a 4xx/5xx page is
//     never mistaken for a GraphQL response body.
//
// Top-level GraphQL `errors` (auth, malformed query) throw
// `ShopifyAdminClientError`; mutation-level `userErrors` (returned inside
// `data`, e.g. an unknown metaobject type) are NOT thrown here — they are
// returned inside `data` so the caller can map them to a user-facing message.
// ---------------------------------------------------------------------------

import 'server-only';
import https from 'node:https';
import { execFile } from 'node:child_process';

export class ShopifyAdminClientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ShopifyAdminClientError';
  }
}

/** Network error codes that trigger the curl fallback. */
const RETRYABLE_NETWORK_ERRORS = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

/** Request timeout in milliseconds for the native https attempt. */
const HTTPS_TIMEOUT_MS = 12_000;

/** Max retries for the curl fallback. */
const CURL_MAX_RETRIES = 3;

/** Hard timeout for the curl fallback (seconds). */
const CURL_TIMEOUT_SEC = 30;

/**
 * Send a GraphQL operation to the Shopify Admin API and return the typed
 * `data` payload. Throws `ShopifyAdminClientError` on a network error, a
 * non-2xx HTTP status, invalid JSON, or a top-level GraphQL `errors` array.
 * Mutation `userErrors` live inside `data` and are the caller's responsibility.
 */
export async function adminRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const apiVersion = process.env.SHOPIFY_API_VERSION;
  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  if (!domain || !apiVersion || !token) {
    throw new ShopifyAdminClientError('Shopify Admin API is not configured');
  }

  const body = JSON.stringify({ query, variables });
  const endpoint = `https://${domain}/admin/api/${apiVersion}/graphql.json`;

  let responseBody: string;

  // --- Attempt 1: native Node https (fast path) ---
  try {
    responseBody = await httpsRequest(endpoint, token, body);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = (err as Error).message ?? '';
    // A timeout surfaced as a plain Error (no `.code`) still looks like a
    // timeout by message — treat it as retryable so the curl fallback runs.
    const looksLikeTimeout = !code && /timeout|timed out/i.test(message);
    if (!code || (!RETRYABLE_NETWORK_ERRORS.has(code) && !looksLikeTimeout)) {
      // Non-network error — don't retry, surface immediately.
      throw new ShopifyAdminClientError('Shopify Admin API request failed');
    }

    // --- Attempt 2: curl fallback (reliable path) ---
    try {
      responseBody = await curlRequest(endpoint, token, body);
    } catch {
      throw new ShopifyAdminClientError('Shopify Admin API request failed');
    }
  }

  let json: { data?: T; errors?: unknown[] };
  try {
    json = JSON.parse(responseBody);
  } catch {
    throw new ShopifyAdminClientError('Shopify Admin API returned invalid JSON');
  }

  // Top-level GraphQL errors (auth-on-GraphQL-layer, malformed query, etc.).
  if (json.errors && json.errors.length > 0) {
    console.error('[Shopify Admin] GraphQL errors:', JSON.stringify(json.errors));
    throw new ShopifyAdminClientError('Shopify Admin API GraphQL error');
  }

  if (!json.data) {
    throw new ShopifyAdminClientError('Shopify Admin API returned no data');
  }

  return json.data;
}

/**
 * Native Node https request with a hard timeout. Returns the raw response
 * body string. Throws on any network error or non-2xx status.
 */
function httpsRequest(endpoint: string, token: string, body: string): Promise<string> {
  const url = new URL(endpoint);

  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    family: 4,
    headers: {
      'Content-Type': 'application/json',
      // Admin API auth header — distinct from the Storefront API's
      // `X-Shopify-Storefront-Access-Token`.
      'X-Shopify-Access-Token': token,
      Accept: 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise<string>((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new ShopifyAdminClientError('Shopify Admin API request failed', res.statusCode));
        }
      });
    });

    // Hard timeout — destroy the request if no response within the limit.
    // The error carries `code: 'ETIMEDOUT'` so the curl-fallback routing in
    // `adminRequest` recognises it as retryable.
    req.setTimeout(HTTPS_TIMEOUT_MS, () => {
      const err = new Error('Shopify Admin API request timed out') as NodeJS.ErrnoException;
      err.code = 'ETIMEDOUT';
      req.destroy(err);
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Escape a value for curl's config-file syntax (double-quoted, C-style
 * escapes). JSON.stringify output never contains raw control characters, so
 * escaping backslashes and double quotes is sufficient.
 */
function escapeCurlConfigValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * curl-based request as a fallback — ASYNC (never blocks the event loop) with
 * --retry and a hard --max-time. curl's libcurl handles DNS, TLS, and
 * connection retries independently of Node's networking stack, making it
 * reliable in environments where Node's https module fails.
 *
 * The auth header and the POST body are passed via stdin (`--config -`) so
 * secrets never appear in the process argument list. `--fail` turns HTTP
 * error statuses into a curl failure instead of a bogus "response body".
 */
function curlRequest(endpoint: string, token: string, body: string): Promise<string> {
  const config = [
    `header = "X-Shopify-Access-Token: ${escapeCurlConfigValue(token)}"`,
    `data = "${escapeCurlConfigValue(body)}"`,
    '',
  ].join('\n');

  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      'curl',
      [
        '-s',
        '--fail',
        '--max-time', String(CURL_TIMEOUT_SEC),
        '--retry', String(CURL_MAX_RETRIES),
        '--retry-delay', '1',
        '--retry-connrefused',
        '-X', 'POST',
        endpoint,
        '-H', 'Content-Type: application/json',
        '-H', 'Accept: application/json',
        '--config', '-', // read the auth header + body from stdin (a pipe)
      ],
      {
        encoding: 'utf-8',
        timeout: (CURL_TIMEOUT_SEC + 5) * 1000, // Node-level timeout as a safety net
        maxBuffer: 10 * 1024 * 1024, // 10MB max response
      },
      (error, stdout) => {
        if (error) {
          reject(new ShopifyAdminClientError('Shopify Admin API request failed: curl error'));
          return;
        }
        if (!stdout) {
          reject(new ShopifyAdminClientError('Shopify Admin API request failed: empty response'));
          return;
        }
        resolve(stdout);
      },
    );

    // The token + body travel over stdin — never argv.
    child.stdin?.write(config);
    child.stdin?.end();
  });
}
