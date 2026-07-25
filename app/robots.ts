import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Cart/checkout are session surfaces — nothing to index there.
      disallow: ['/cart', '/checkout'],
    },
    sitemap: 'https://wearapeiron.com/sitemap.xml',
  };
}
