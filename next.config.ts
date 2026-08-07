import type {NextConfig} from 'next';

const isDev = process.env.NODE_ENV === 'development';

// The Content-Security-Policy lives in proxy.ts: it is NONCE-BASED
// (per-request nonce threaded to Next's inline scripts via the request
// header) and enforced in production, report-only in dev. Do NOT re-add a
// static CSP here — a static `script-src 'self'` (no nonce) blocks Next's
// inline hydration/bootstrap scripts and breaks the site when enforced.
//
// Next.js 16 notes:
//   - Turbopack is the default bundler for dev AND build, so there is no
//     `webpack` key here — a webpack config makes `next build` fail. (The old
//     DISABLE_HMR watch hack was sandbox-specific and is gone; Turbopack file
//     watching doesn't need it.)
//   - The `eslint` config key and `next lint` are removed — linting runs via
//     the ESLint CLI (`npm run lint`), never during `next build`.

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
};

export default nextConfig;
