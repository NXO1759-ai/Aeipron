// ---------------------------------------------------------------------------
// Catalog — the single source of truth for everything sellable.
//
// This module is the trust boundary for pricing. Every server component, route,
// and server action reads product data and prices from here, NEVER from values
// supplied by the browser. Today it's backed by in-memory mock data; swapping it
// for a database query later changes only the bodies of these functions, not
// their callers.
//
// Do not import this file from a 'use client' component. It is server-only data
// and must not be shipped to the browser bundle.
// ---------------------------------------------------------------------------

import type { Product, Organizer, MerchItem } from './types';

const COLLECTION_PRODUCTS: Product[] = [
  {
    id: 'prod-0',
    name: 'Hexagon Heavyweight Hoodie',
    price: 185,
    description:
      'Custom-milled, heavyweight Japanese loopback terry. Features "The Fold" in ivory chain-stitch embroidery and the "Geometric Hexagon" applied in high-density, flat matte ivory ink.',
    images: [
      'https://picsum.photos/seed/hoodie1/1200/1600',
      'https://picsum.photos/seed/hoodie2/1200/1600',
      'https://picsum.photos/seed/hoodie3/1200/1600',
      'https://picsum.photos/seed/hoodie4/1200/1600',
    ],
    sizes: [
      { size: 'S', inStock: true },
      { size: 'M', inStock: true },
      { size: 'L', inStock: false },
      { size: 'XL', inStock: true },
      { size: 'XXL', inStock: false },
    ],
  },
  {
    id: 'prod-1',
    name: 'Structural Loopback Crew',
    price: 160,
    description:
      'A 450GSM crewneck cut from the same heavyweight terry, finished with blind-debossed seams and a structural fold at the collar. Built to hold its silhouette wash after wash.',
    images: [
      'https://picsum.photos/seed/crew1/1200/1600',
      'https://picsum.photos/seed/crew2/1200/1600',
      'https://picsum.photos/seed/crew3/1200/1600',
    ],
    sizes: [
      { size: 'S', inStock: true },
      { size: 'M', inStock: true },
      { size: 'L', inStock: true },
      { size: 'XL', inStock: false },
    ],
  },
  {
    id: 'prod-2',
    name: 'Architectural Cargo Pant',
    price: 170,
    description:
      'Hyper-durable ripstop with articulated knees and a tapered, architectural leg. Every seam is calibrated for movement and longevity.',
    images: [
      'https://picsum.photos/seed/cargo1/1200/1600',
      'https://picsum.photos/seed/cargo2/1200/1600',
      'https://picsum.photos/seed/cargo3/1200/1600',
    ],
    sizes: [
      { size: 'S', inStock: false },
      { size: 'M', inStock: true },
      { size: 'L', inStock: true },
      { size: 'XL', inStock: true },
    ],
  },
];

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

// --- Build flat lookup indexes once at module load (O(1) reads thereafter) ---

const productById = new Map(COLLECTION_PRODUCTS.map((p) => [p.id, p]));
const organizerById = new Map(ORGANIZERS.map((o) => [o.id, o]));

// Every sellable SKU (collection products + organizer merch) collapsed into a
// single price/size index, so getCatalogPrice can validate any cart line.
interface Sku {
  price: number;
  sizes: Set<string>;
}
const skuIndex = new Map<string, Sku>();
for (const p of COLLECTION_PRODUCTS) {
  skuIndex.set(p.id, { price: p.price, sizes: new Set(p.sizes.map((s) => s.size)) });
}
for (const o of ORGANIZERS) {
  for (const m of o.merch) {
    skuIndex.set(m.id, { price: m.price, sizes: new Set(m.sizes) });
  }
}

// --- Read API ---------------------------------------------------------------

export function getCollectionProducts(): Product[] {
  return COLLECTION_PRODUCTS;
}

export function getProductBySlug(slug: string): Product | null {
  return productById.get(slug) ?? null;
}

export function getOrganizer(id: string): Organizer | null {
  return organizerById.get(id) ?? null;
}

export function getOrganizerSummaries(): Pick<Organizer, 'id' | 'name' | 'image'>[] {
  return ORGANIZERS.map(({ id, name, image }) => ({ id, name, image }));
}

/**
 * Authoritative unit price for a SKU. Throws on any unknown id or any size the
 * SKU does not offer — this is what makes client-supplied prices irrelevant.
 */
export function getCatalogPrice(id: string, size: string): number {
  const sku = skuIndex.get(id);
  if (!sku) throw new Error(`Unknown product: ${id}`);
  if (!sku.sizes.has(size)) throw new Error(`Size ${size} not available for ${id}`);
  return sku.price;
}

// Shipping is a pricing rule, so it lives server-side next to prices.
export const FREE_SHIPPING_THRESHOLD = 200;
export const FLAT_SHIPPING_RATE = 15;

export function getShipping(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE;
}
