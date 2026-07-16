import { describe, it, expect, vi } from 'vitest';

// admin-queries.ts imports 'server-only' (build-time guard against client
// imports); under Vitest its default export throws, so mock it to an empty
// module.
vi.mock('server-only', () => ({}));

import { CONTACT_METAOBJECT_CREATE_MUTATION } from '@/lib/shopify/admin-queries';

// ---------------------------------------------------------------------------
// Contact Admin GraphQL mutation validation.
//
// Mirrors tests/*-queries.test.ts: structural validity (named operation, typed
// `$variables`, the Admin API `metaobjectCreate` mutation) and required-field
// presence. Catches drift at test time without needing a live Admin connection.
// ---------------------------------------------------------------------------

const op = CONTACT_METAOBJECT_CREATE_MUTATION;

describe('CONTACT_METAOBJECT_CREATE_MUTATION — structure', () => {
  it('is a named mutation', () => {
    expect(op).toMatch(/mutation\s+contactMetaobjectCreate\s*\(/);
  });

  it('declares a typed $metaobject variable (MetaobjectCreateInput!)', () => {
    expect(op).toContain('$metaobject: MetaobjectCreateInput!');
  });

  it('calls metaobjectCreate with the $metaobject variable', () => {
    expect(op).toMatch(/metaobjectCreate\s*\(\s*metaobject:\s*\$metaobject\s*\)/);
  });

  it('selects userErrors (field, message, code) so the caller can map failures', () => {
    expect(op).toContain('userErrors');
    expect(op).toContain('field');
    expect(op).toContain('message');
    expect(op).toContain('code');
  });

  it('does NOT select the created metaobject (avoids the read_metaobjects scope)', () => {
    // Selecting the created metaobject back needs `read_metaobjects`, which the
    // custom app does not have — including it would cause a false failure on a
    // successful create. Empty userErrors is the success signal instead.
    expect(op).not.toMatch(/metaobject\s*\{[^}]*\bid\b/);
    expect(op).not.toMatch(/metaobject\s*\{[^}]*\bhandle\b/);
  });
});