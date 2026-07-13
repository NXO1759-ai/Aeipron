// ---------------------------------------------------------------------------
// Catalog — the single source of truth for everything sellable.
//
// --- Shopify-backed (Phase 1): getCollections, getCollectionByHandle,
// ---                          getProductBySlug ---
// --- Mock-backed (until Phase 4 / Metaobjects): getOrganizer*,
// ---     ORGANIZERS, organizerById ---
//
// Product + collection reads go through the Shopify Storefront API. Pricing
// comes from Shopify (cart line `cost.amountPerQuantity`); no mock price source
// remains here. Organizer data is still mock-backed until Phase 4 (Metaobjects).
//
// Do not import this file from a 'use client' component. It is server-only data
// and must not be shipped to the browser bundle.
// ---------------------------------------------------------------------------

import type { Product, Organizer, CollectionSummary, Collection } from './types';
import { shopifyRequest } from '@/lib/shopify/client';
import {
  COLLECTION_LIST_QUERY,
  COLLECTION_BY_HANDLE_QUERY,
  PRODUCT_BY_HANDLE_QUERY,
} from '@/lib/shopify/queries';
import { mapProduct, mapCollectionSummary } from '@/lib/shopify/adapter';
import type {
  ShopifyCollectionsResponse,
  ShopifyCollectionByHandleResponse,
  ShopifyProductByHandleResponse,
} from '@/lib/shopify/types';

// ---------------------------------------------------------------------------
// Mock data — organizers (removed in Phase 4 / Metaobjects)
// ---------------------------------------------------------------------------

const ORGANIZERS: Organizer[] = [
  {
    id: 'org-1',
    name: 'Techno Syndicate',
    image: 'https://picsum.photos/seed/org1/1200/800',
    heroImage: 'https://picsum.photos/seed/orgmerch/1920/1080',
    merch: [
      { id: 'm1', name: 'Techno Syndicate Tour Tee', price: 65, image: 'https://picsum.photos/seed/merch1/600/800', sizes: ['S', 'M', 'L', 'XL'] },
      { id: 'm2', name: 'Stage Crew Hoodie', price: 150, image: 'https://picsum.photos/seed/merch2/600/800', sizes: ['M', 'L'] },
      { id: 'm3', name: 'Backstage Pass Lanyard', price: 35, image: 'https://picsum.photos/seed/merch3/600/800', sizes: ['OS'] },
      { id: 'm4', name: 'Industrial Zip Jacket', price: 210, image: 'https://picsum.photos/seed/merch4/600/800', sizes: ['S', 'M', 'L'] },
    ],
  },
];

const organizerById = new Map(ORGANIZERS.map((o) => [o.id, o]));

// ---------------------------------------------------------------------------
// Read API — Shopify-backed collection + product reads; mock-backed organizers
// ---------------------------------------------------------------------------

export async function getCollections(): Promise<CollectionSummary[]> {
  const data = await shopifyRequest<ShopifyCollectionsResponse>(COLLECTION_LIST_QUERY);
  return data.collections.nodes.map(mapCollectionSummary);
}

export async function getCollectionByHandle(handle: string): Promise<Collection | null> {
  const data = await shopifyRequest<ShopifyCollectionByHandleResponse>(
    COLLECTION_BY_HANDLE_QUERY,
    { handle },
  );
  const node = data.collectionByHandle;
  if (!node) return null;
  return {
    ...mapCollectionSummary(node),
    products: node.products.nodes.map(mapProduct),
  };
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const data = await shopifyRequest<ShopifyProductByHandleResponse>(
    PRODUCT_BY_HANDLE_QUERY,
    { handle: slug },
  );
  return data.product ? mapProduct(data.product) : null;
}

export function getOrganizer(id: string): Organizer | null {
  return organizerById.get(id) ?? null;
}

export function getOrganizerSummaries(): Pick<Organizer, 'id' | 'name' | 'image'>[] {
  return ORGANIZERS.map(({ id, name, image }) => ({ id, name, image }));
}
