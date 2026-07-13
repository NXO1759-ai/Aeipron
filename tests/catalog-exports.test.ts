import { describe, it, expect, vi } from 'vitest';

// catalog.ts imports shopifyRequest from @/lib/shopify/client, which transitively
// imports 'server-only'. Under Vitest its default export throws, so mock it to an
// empty module. (The `import 'server-only'` boundary is still enforced at build
// time by Next.)
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Catalog exports regression test (Phase 3 Task 2).
//
// The mock-pricing scaffolding (getCatalogPrice / getShipping /
// FREE_SHIPPING_THRESHOLD / FLAT_SHIPPING_RATE / Sku / skuIndex) was deleted from
// lib/catalog.ts in Phase 3. This test guards against accidental reintroduction
// by asserting those symbols are gone, while confirming the live Shopify reads +
// mock organizer reads that must remain (organizers stay until Phase 4).
// ---------------------------------------------------------------------------

import * as catalog from '@/lib/catalog';

// The deleted mock-pricing symbols are gone from the typed `catalog` namespace,
// so accessing them directly is a TS2339 error under the repo's `tsc --noEmit`
// gate (Next's build typecheck does not cover test files). Access them via a
// record cast so the "they're gone" assertions still compile, while the
// surviving-export assertions below stay fully type-checked (a typo in
// `catalog.getCollections` would still fail tsc).
const deletedExports = catalog as unknown as Record<string, unknown>;

describe('lib/catalog exports (Phase 3 cleanup)', () => {
  it('does not export the deleted mock-pricing symbols', () => {
    expect(deletedExports.getCatalogPrice).toBeUndefined();
    expect(deletedExports.getShipping).toBeUndefined();
    expect(deletedExports.FREE_SHIPPING_THRESHOLD).toBeUndefined();
    expect(deletedExports.FLAT_SHIPPING_RATE).toBeUndefined();
  });

  it('still exports the live Shopify reads + organizer reads', () => {
    expect(typeof catalog.getCollections).toBe('function');
    expect(typeof catalog.getCollectionByHandle).toBe('function');
    expect(typeof catalog.getProductBySlug).toBe('function');
    expect(typeof catalog.getOrganizer).toBe('function');
    expect(typeof catalog.getOrganizerSummaries).toBe('function');
  });
});