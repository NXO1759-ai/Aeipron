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
// ---------------------------------------------------------------------------

import 'server-only';

export class ShopifyClientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ShopifyClientError';
  }
}

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

  const endpoint = `https://${domain}/api/${apiVersion}/graphql.json`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ShopifyClientError('Shopify request failed: network error');
  }

  if (!response.ok) {
    throw new ShopifyClientError('Shopify request failed', response.status);
  }

  const json: { data?: T; errors?: unknown[] } = await response.json();

  if (json.errors && json.errors.length > 0) {
    // Log the full errors server-side for debugging, but never surface them
    // to the client — they may contain internal SKU/GraphQL details.
    console.error('[Shopify] GraphQL errors:', JSON.stringify(json.errors));
    throw new ShopifyClientError('Shopify GraphQL error');
  }

  if (!json.data) {
    throw new ShopifyClientError('Shopify returned no data');
  }

  return json.data;
}