import 'server-only';

// ---------------------------------------------------------------------------
// Reviewable products — the product list behind the /review submission form.
//
// Judge.me's create-review API identifies products by their EXTERNAL Shopify
// numeric product ID (not the handle), so this query selects the product GID
// and derives the numeric ID from it (gid://shopify/Product/123 → 123).
// Kept separate from lib/catalog's getAllProducts (which maps `id` to the
// handle for routing and would need an adapter change to expose the GID).
// ---------------------------------------------------------------------------

import { shopifyRequest } from '@/lib/shopify/client';

export interface ReviewableProduct {
  /** Shopify handle — matches the /product/[slug] route + ?product= param. */
  handle: string;
  title: string;
  /** Featured image URL, '' when the product has none. */
  image: string;
  /** External Shopify numeric product ID — what Judge.me's create API wants. */
  productId: number;
}

const REVIEWABLE_PRODUCTS_QUERY = /* GraphQL */ `
  query ReviewableProducts {
    products(first: 250, query: "status:active") {
      nodes {
        id
        handle
        title
        featuredImage { url }
      }
    }
  }
`;

interface ReviewableProductsResponse {
  products: {
    nodes: {
      id: string; // gid://shopify/Product/<numeric id>
      handle: string;
      title: string;
      featuredImage: { url: string } | null;
    }[];
  };
}

export async function getReviewableProducts(): Promise<ReviewableProduct[]> {
  const data = await shopifyRequest<ReviewableProductsResponse>(REVIEWABLE_PRODUCTS_QUERY);
  return data.products.nodes
    .map((node) => ({
      handle: node.handle,
      title: node.title,
      image: node.featuredImage?.url ?? '',
      productId: Number(node.id.split('/').pop()),
    }))
    .filter((p) => Number.isFinite(p.productId) && p.productId > 0);
}
