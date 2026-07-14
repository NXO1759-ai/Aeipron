import Link from 'next/link';
import { getContactContent } from '@/lib/content';

// ---------------------------------------------------------------------------
// Footer — site-wide footer rendered on every page except /checkout (which is
// dormant; LayoutWrapper suppresses it there).
//
// Two link columns — Shop (Collection, Our Story) and Support (Help/FAQ,
// Contact Us) — plus the studio origin line (sourced from lib/content so it
// stays in sync with the /contact page) and a copyright row.
//
// COMPONENT BOUNDARY: this file has no 'use client' directive, but it is
// imported by the 'use client' LayoutWrapper, so Next bundles it into the
// client tree. That is safe ONLY because it uses next/link + static markup
// with no server-only imports. Do NOT add a Shopify fetch or anything from
// lib/shopify/* or lib/cart-cookie here — that would break the build. If the
// footer ever needs server data, render it as a Server Component passed via
// children, not imported into the client LayoutWrapper.
// ---------------------------------------------------------------------------

const shopLinks = [
  { label: 'Collection', href: '/collection' },
  { label: 'Our Story', href: '/story' },
];

const supportLinks = [
  { label: 'Help / FAQ', href: '/help' },
  { label: 'Contact Us', href: '/contact' },
];

const linkColumns = [
  { title: 'Shop', links: shopLinks },
  { title: 'Support', links: supportLinks },
];

export function Footer() {
  const { address } = getContactContent();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-primary-obsidian px-4 sm:px-6 lg:px-8 py-16 border-t border-ui-concrete/20">
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
        {/* Brand + origin */}
        <div className="flex flex-col gap-3 text-center sm:text-left">
          <span className="text-primary-cream font-bold uppercase tracking-[0.2em] text-lg">Apeiron</span>
          <span className="text-ui-concrete uppercase tracking-widest text-xs font-bold">
            Shipping from {address}
          </span>
        </div>

        {/* Link columns */}
        {linkColumns.map((column) => (
          <nav
            key={column.title}
            aria-label={column.title}
            className="flex flex-col gap-3 text-center sm:text-left"
          >
            <h2 className="text-ui-concrete uppercase tracking-widest text-xs font-bold mb-1">
              {column.title}
            </h2>
            {column.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-primary-cream uppercase tracking-widest text-xs font-bold hover:text-accent-energy transition-colors w-fit sm:w-fit mx-auto sm:mx-0"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-ui-concrete/10">
        {/* suppressHydrationWarning: the year is computed at render time and may
            differ between the build-time SSR HTML and the client hydration
            (e.g. across a New Year boundary); this is the documented Next.js
            pattern for time-sensitive content. */}
        <p
          suppressHydrationWarning
          className="text-ui-concrete uppercase tracking-widest text-xs font-bold text-center sm:text-right"
        >
          &copy; {year} Apeiron
        </p>
      </div>
    </footer>
  );
}