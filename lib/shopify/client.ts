// ---------------------------------------------------------------------------
// Shopify Storefront API client — the single server-only entry point for all
// Shopify GraphQL operations (products, metaobjects, cart).
//
// DO NOT import this file from any component marked 'use client'. The
// `import 'server-only'` line below makes any client import fail at build
// time. Importing it from a client component would ship the Storefront access
// token to the browser bundle, leaking it to end users.
//
// All Shopify calls go through `shopifyRequest`. Never construct a Shopify
// fetch inline in a route, server action, or component — call this function.
//
// Transport strategy: tries Node's native https first (fast in production
// environments like Vercel). If that fails with a network error (ETIMEDOUT,
// ECONNRESET, ENOTFOUND, etc.), falls back to curl as a child process —
// curl uses its own DNS resolver and TLS stack (libcurl + OpenSSL) which is
// more reliable in environments where Node's networking is restricted.
// The curl fallback includes built-in retry (--retry 3) and a hard timeout.
//
// Curl fallback hardening:
//   - Runs ASYNCHRONOUSLY (execFile, not execFileSync) so a slow Shopify edge
//     can never block the Node event loop for every in-flight request on the
//     instance (the sync version could stall the process for up to ~35s).
//   - The access token and the request body (which can carry the cart id with
//     its `?key=` secret) travel over the child's stdin (`--config -`), NEVER
//     the argument list — anything able to read /proc or run `ps` on the host
//     cannot scrape them from argv.
//   - `--fail` makes curl exit non-zero on HTTP errors, so a 4xx/5xx page is
//     never mistaken for a GraphQL response body.
// ---------------------------------------------------------------------------

import 'server-only';
import https from 'node:https';
import { execFile } from 'node:child_process';

export class ShopifyClientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ShopifyClientError';
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
const HTTPS_TIMEOUT_MS = 10_000;

/** Max retries for the curl fallback. */
const CURL_MAX_RETRIES = 3;

/** Hard timeout for the curl fallback (seconds). */
const CURL_TIMEOUT_SEC = 30;

/**
 * Send a GraphQL operation to the Shopify Storefront API and return the typed
 * `data` payload. Throws `ShopifyClientError` on non-2xx HTTP or on a GraphQL
 * `errors` array. Internal SKU/GraphQL details are never surfaced in the
 * error message — they are logged server-side only.
 */
export async function shopifyRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const apiVersion = process.env.SHOPIFY_API_VERSION;
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!domain || !apiVersion || !token) {
    throw new ShopifyClientError('Shopify environment variables are not configured');
  }

  const body = JSON.stringify({ query, variables });
  const endpoint = `https://${domain}/api/${apiVersion}/graphql.json`;

  let responseBody: string;

  // --- Attempt 1: native Node https (fast path) ---
  try {
    responseBody = await httpsRequest(endpoint, token, body);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = (err as Error).message ?? '';
    // A timeout surfaced as a plain Error (no `.code`) still looks like a
    // timeout by message — treat it as retryable so the curl fallback runs
    // instead of failing the request outright.
    const looksLikeTimeout = !code && /timeout|timed out/i.test(message);
    if (!code || (!RETRYABLE_NETWORK_ERRORS.has(code) && !looksLikeTimeout)) {
      // Non-network error — don't retry, surface immediately.
      throw new ShopifyClientError('Shopify request failed: network error');
    }

    // --- Attempt 2: curl fallback (reliable path) ---
    try {
      responseBody = await curlRequest(endpoint, token, body);
    } catch {
      throw new ShopifyClientError('Shopify request failed: network error');
    }
  }

  let json: { data?: T; errors?: unknown[] };
  try {
    json = JSON.parse(responseBody);
  } catch {
    throw new ShopifyClientError('Shopify returned invalid JSON');
  }

  if (json.errors && json.errors.length > 0) {
    console.error('[Shopify] GraphQL errors:', JSON.stringify(json.errors));
    throw new ShopifyClientError('Shopify GraphQL error');
  }

  if (!json.data) {
    throw new ShopifyClientError('Shopify returned no data');
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
      'X-Shopify-Storefront-Access-Token': token,
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
          reject(new ShopifyClientError('Shopify request failed', res.statusCode));
        }
      });
    });

    // Hard timeout — destroy the request if no response within the limit.
    // The error carries `code: 'ETIMEDOUT'` so the curl-fallback routing in
    // `shopifyRequest` recognises it as retryable (a plain `new Error()` has
    // no `.code` and would wrongly be treated as a non-retryable failure,
    // bypassing the curl fallback entirely).
    req.setTimeout(HTTPS_TIMEOUT_MS, () => {
      const err = new Error('Shopify request timed out') as NodeJS.ErrnoException;
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
    `header = "X-Shopify-Storefront-Access-Token: ${escapeCurlConfigValue(token)}"`,
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
          reject(new ShopifyClientError('Shopify request failed: curl error'));
          return;
        }
        if (!stdout) {
          reject(new ShopifyClientError('Shopify request failed: empty response'));
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
