// ---------------------------------------------------------------------------
// seed-shipping-protection-content.mjs
//
// One-off, IDEMPOTENT seeding of the `shipping_protection_content` Shopify
// metaobject that drives the Captain shipping-protection toggle's copy + fee
// rate from the Shopify Admin (so the client edits them without a GitHub
// deploy). This script is NOT part of the app bundle — it is run manually by a
// developer against the store. Safe to re-run: it creates the definition + the
// single `default` entry only if they are missing, and updates the entry's
// fields in place otherwise.
//
// What it does:
//   1. Creates the `shipping_protection_content` metaobject definition with
//      fields label_on / label_off / description / rate / enabled and
//      Storefront visibility = PUBLIC_READ (so the Storefront API can read it).
//   2. Creates (or updates) one entry, handle `default`, seeded with the
//      current toggle copy + rate "0.01" (1%) + enabled "true".
//   3. Reads the entry back via the PUBLIC Storefront API to confirm the site
//      can see it — prints the field values.
//
// Reads SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_ACCESS_TOKEN,
// SHOPIFY_PUBLIC_STORE_DOMAIN, SHOPIFY_STOREFRONT_ACCESS_TOKEN,
// SHOPIFY_API_VERSION from .env.local (parsed manually — plain node ESM does
// not auto-load it). NEVER prints the tokens.
//
// Usage:  node scripts/seed-shipping-protection-content.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env.local');

/** Parse a .env-style file into a plain object. Skips blanks + `#` comments. */
function loadEnv(path) {
  const text = readFileSync(path, 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = loadEnv(ENV_PATH);
const ADMIN_DOMAIN = env.SHOPIFY_STORE_DOMAIN;
const ADMIN_TOKEN = env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const STOREFRONT_DOMAIN = env.SHOPIFY_PUBLIC_STORE_DOMAIN;
const STOREFRONT_TOKEN = env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
const API_VERSION = env.SHOPIFY_API_VERSION;

for (const [k, v] of [
  ['SHOPIFY_STORE_DOMAIN', ADMIN_DOMAIN],
  ['SHOPIFY_ADMIN_API_ACCESS_TOKEN', ADMIN_TOKEN],
  ['SHOPIFY_PUBLIC_STORE_DOMAIN', STOREFRONT_DOMAIN],
  ['SHOPIFY_STOREFRONT_ACCESS_TOKEN', STOREFRONT_TOKEN],
  ['SHOPIFY_API_VERSION', API_VERSION],
]) {
  if (!v) {
    console.error(`Missing ${k} in ${ENV_PATH}`);
    process.exit(1);
  }
}

const TYPE = 'shipping_protection_content';
const HANDLE = 'default';

/** The seeded copy — mirrors the original hardcoded toggle copy + the client's 1% rate. */
const SEED_FIELDS = [
  { key: 'label_on', value: 'Shipping protection' },
  { key: 'label_off', value: 'Add shipping protection' },
  {
    key: 'description',
    value: 'Cover loss, theft, and damage in transit. Added at checkout by Captain.',
  },
  { key: 'rate', value: '0.01' },
  { key: 'enabled', value: 'true' },
];

async function adminRequest(query, variables) {
  const res = await fetch(`https://${ADMIN_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error('Admin GraphQL errors: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

async function storefrontRequest(query, variables) {
  const res = await fetch(`https://${STOREFRONT_DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors && json.errors.length) {
    throw new Error('Storefront GraphQL errors: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

const DEFINITION_CREATE = `#graphql
  mutation ShippingProtectionContentDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { type name }
      userErrors { field message code }
    }
  }
`;

const DEFINITION_BY_TYPE = `#graphql
  query ShippingProtectionContentDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) { id type name }
  }
`;

const ENTRY_BY_HANDLE = `#graphql
  query ShippingProtectionContentByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) { id handle }
  }
`;

const ENTRY_CREATE = `#graphql
  mutation ShippingProtectionContentCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message code }
    }
  }
`;

const ENTRY_UPDATE = `#graphql
  mutation ShippingProtectionContentUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message code }
    }
  }
`;

const STOREFRONT_READ = `#graphql
  query ShippingProtectionContentStorefront($handle: MetaobjectHandleInput!) {
    metaobject(handle: $handle) { handle fields { key value } }
  }
`;

async function ensureDefinition() {
  const existing = await adminRequest(DEFINITION_BY_TYPE, { type: TYPE });
  if (existing.metaobjectDefinitionByType) {
    console.log(`[definition] already exists (${existing.metaobjectDefinitionByType.name}).`);
    return;
  }
  const created = await adminRequest(DEFINITION_CREATE, {
    definition: {
      name: 'Shipping Protection Content',
      type: TYPE,
      displayNameKey: 'label_off',
      access: { storefront: 'PUBLIC_READ' },
      fieldDefinitions: [
        { key: 'label_on', name: 'Label (on)', type: 'single_line_text_field' },
        { key: 'label_off', name: 'Label (off)', type: 'single_line_text_field' },
        { key: 'description', name: 'Description', type: 'multi_line_text_field' },
        { key: 'rate', name: 'Rate', type: 'single_line_text_field' },
        { key: 'enabled', name: 'Enabled', type: 'boolean' },
      ],
    },
  });
  const errs = created.metaobjectDefinitionCreate.userErrors;
  if (errs && errs.length) {
    throw new Error('Definition create userErrors: ' + JSON.stringify(errs));
  }
  console.log('[definition] created.');
}

async function ensureEntry() {
  const existing = await adminRequest(ENTRY_BY_HANDLE, {
    handle: { handle: HANDLE, type: TYPE },
  });
  if (existing.metaobjectByHandle) {
    const id = existing.metaobjectByHandle.id;
    const updated = await adminRequest(ENTRY_UPDATE, {
      id,
      metaobject: { fields: SEED_FIELDS },
    });
    const errs = updated.metaobjectUpdate.userErrors;
    if (errs && errs.length) {
      throw new Error('Entry update userErrors: ' + JSON.stringify(errs));
    }
    console.log(`[entry] updated (${HANDLE}).`);
    return;
  }
  const created = await adminRequest(ENTRY_CREATE, {
    metaobject: { type: TYPE, handle: HANDLE, fields: SEED_FIELDS },
  });
  const errs = created.metaobjectCreate.userErrors;
  if (errs && errs.length) {
    throw new Error('Entry create userErrors: ' + JSON.stringify(errs));
  }
  console.log(`[entry] created (${HANDLE}).`);
}

async function readBack() {
  const data = await storefrontRequest(STOREFRONT_READ, {
    handle: { handle: HANDLE, type: TYPE },
  });
  const mo = data.metaobject;
  if (!mo) {
    console.warn(
      '[read-back] Storefront returned null — the definition may not yet be Storefront-visible ' +
        '(the Admin UI toggle "Use for Storefront API", or propagation lag). Re-run in a minute.',
    );
    return;
  }
  console.log('[read-back] Storefront sees the entry:');
  for (const f of mo.fields) {
    console.log(`  ${f.key} = ${JSON.stringify(f.value)}`);
  }
}

async function main() {
  await ensureDefinition();
  await ensureEntry();
  await readBack();
  console.log('\nDone. The client can now edit Content → Metaobjects → Shipping Protection Content → default to change the toggle copy + rate (no GitHub deploy).');
}

main().catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});