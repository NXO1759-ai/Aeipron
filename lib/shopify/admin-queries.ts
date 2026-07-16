// ---------------------------------------------------------------------------
// Shopify Admin API GraphQL operation strings.
//
// Distinct from `lib/shopify/queries.ts` (Storefront API): these operations
// run against `/admin/api/{version}/graphql.json` with the Admin access token
// and perform WRITES to the store. The Admin API surface has a different
// schema (e.g. `metaobjectCreate`) and is server-only — never import this
// file from a 'use client' component (the `import 'server-only'` line makes
// any client import fail at build time).
//
// Field selections are verified against the Admin API 2025-07 docs:
//   https://shopify.dev/docs/api/admin-graphql/2025-07/mutations/metaobjectCreate
// ---------------------------------------------------------------------------

import 'server-only';

/**
 * Create a `contact_message` metaobject from a headless contact-form
 * submission. The metaobject `type` (e.g. "contact_message") must already be
 * defined in the store (Settings → Custom data → Metaobjects); this mutation
 * only creates an entry of that type. `fields` are key/value pairs where
 * `value` is a string — matching the single-line / multi-line text fields of
 * the definition.
 *
 * LEAST-PRIVILEGE FIELD SELECTION: selects ONLY `userErrors` — NOT the created
 * `metaobject { id handle }`. Selecting the created metaobject back requires
 * the `read_metaobjects` access scope (the custom app only needs
 * `write_metaobjects`); selecting it without that scope makes Shopify return a
 * top-level `errors` entry ("Access denied … read_metaobjects"), which our
 * Admin client treats as a hard failure — even though the entry WAS created.
 * That would surface a failure to the user while the submission silently
 * succeeded, causing duplicate re-submissions. Empty `userErrors` is the
 * success signal: Shopify returns a 200 with an empty `userErrors` array when
 * the metaobject is created, and a non-empty `userErrors` array (e.g.
 * `UNDEFINED_OBJECT_TYPE` if the definition is missing) on failure.
 */
export const CONTACT_METAOBJECT_CREATE_MUTATION = `#graphql
  mutation contactMetaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      userErrors {
        field
        message
        code
      }
    }
  }
`;