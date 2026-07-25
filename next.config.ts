import type {NextConfig} from 'next';

const isDev = process.env.NODE_ENV === 'development';

// Content-Security-Policy, single source for both the enforced-Report-Only
// header below and future tightening. Ships in REPORT-ONLY mode first: it
// surfaces violations in the console/monitoring without breaking anything —
// flip to `Content-Security-Policy` once a deploy cycle shows no violations.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // next/image data: placeholders + Shopify CDN product imagery.
  "img-src 'self' https://cdn.shopify.com data:",
  // Next inline styles + motion inline transforms require 'unsafe-inline'.
  "style-src 'self' 'unsafe-inline'",
  // @vercel/analytics loads its script from the same origin on Vercel; the
  // va.vercel-scripts.com entry covers self-hosted installs.
  "script-src 'self' https://va.vercel-scripts.com",
  "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // HSTS: HTTPS-only from here on (Cloudflare terminates TLS in front).
          {key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload'},
          {key: 'X-Content-Type-Options', value: 'nosniff'},
          // Clickjacking defense (CSP frame-ancestors mirrors this for modern browsers).
          {key: 'X-Frame-Options', value: 'DENY'},
          {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
          {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
          {key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY},
        ],
      },
    ];
  },
  images: {
    // When the Node runtime can't reach external hosts (sandbox/dev), the
    // image optimizer returns 500. `unoptimized: true` makes next/image pass
    // remote URLs straight to the browser, which fetches them directly.
    // Production runs with NODE_ENV=production, where the optimizer is active.
    unoptimized: isDev,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify — file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
