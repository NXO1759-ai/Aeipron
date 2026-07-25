import type { MetadataRoute } from 'next';

// Static route list — the store runs one collection and a handful of editorial
// pages today. Product routes join this list (from the catalog) when the
// assortment grows beyond the single hero product.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://wearapeiron.com';
  const routes = ['', '/shop', '/product/hoodie', '/story', '/contact', '/help'];
  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' || path === '/shop' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : path.startsWith('/product') || path === '/shop' ? 0.9 : 0.5,
  }));
}
