// ---------------------------------------------------------------------------
// Catalog — the single source of truth for everything sellable.
//
// --- Shopify-backed (Phase 1): getCollectionProducts, getProductBySlug ---
// --- Mock-backed (removed in later phases): getOrganizer*, getCatalogPrice,
//     getShipping, constants, ORGANIZERS, skuIndex ---
//
// Product reads now go through the Shopify Storefront API. The mock pricing
// index (skuIndex) and organizer data remain until Phases 2–4 rewire the
// cart, checkout, and organizer routes.
//
// Do not import this file from a 'use client' component. It is server-only data
// and must not be shipped to the browser bundle.
// ---------------------------------------------------------------------------

import type { Product, Organizer } from './types';
import { shopifyRequest } from '@/lib/shopify/client';
import { PRODUCT_LIST_QUERY, PRODUCT_BY_HANDLE_QUERY } from '@/lib/shopify/queries';
import { mapProduct } from '@/lib/shopify/adapter';
import type {
  ShopifyProductsResponse,
  ShopifyProductByHandleResponse,
} from '@/lib/shopify/types';

// ---------------------------------------------------------------------------
// Mock data — organizers + pricing index (removed in Phases 2–4)
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

// Pricing index for the checkout server action (mock-backed until Phase 3).
// Only organizer merch is indexed here — product pricing now comes from Shopify.
interface Sku {
  price: number;
  sizes: Set<string>;
}
const skuIndex = new Map<string, Sku>();
for (const o of ORGANIZERS) {
  for (const m of o.merch) {
    skuIndex.set(m.id, { price: m.price, sizes: new Set(m.sizes) });
  }
}

// ---------------------------------------------------------------------------
// Read API — Shopify-backed product reads + mock-backed organizer reads
// ---------------------------------------------------------------------------

export async function getCollectionProducts(): Promise<Product[]> {
  const data = await shopifyRequest<ShopifyProductsResponse>(PRODUCT_LIST_QUERY);
  return data.products.nodes.map(mapProduct);
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

// ---------------------------------------------------------------------------
// Mock pricing — removed in Phase 3 when Shopify cart replaces the checkout
// ---------------------------------------------------------------------------

export function getCatalogPrice(id: string, size: string): number {
  const sku = skuIndex.get(id);
  if (!sku) throw new Error(`Unknown product: ${id}`);
  if (!sku.sizes.has(size)) throw new Error(`Size ${size} not available for ${id}`);
  return sku.price;
}

export const FREE_SHIPPING_THRESHOLD = 200;
export const FLAT_SHIPPING_RATE = 15;

export function getShipping(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE;
}
