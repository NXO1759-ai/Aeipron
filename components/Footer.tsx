import Link from 'next/link';
import { Instagram } from 'lucide-react';
import { getContactContent } from '@/lib/content';
import { NewsletterForm } from './NewsletterForm';
import { FooterLegal } from './FooterLegal';

// ---------------------------------------------------------------------------
// Footer — redesigned site-wide footer (reference image).
//
// Four columns on desktop (two on mobile, brand/newsletter spanning full width):
//   1. Brand block — small APEIRON® wordmark (tight tracking + ®, per the
//      brand banner — deliberately different from the header lockup), no
//      tagline (the "Beyond the trend." line now lives in the home closer).
//   2. Shop links — Shop, Our Story (with arrows), no group label.
//   3. Support links — Help Center, Contact Us (with arrows), no group label.
//   4. Join the List — newsletter copy + NewsletterForm email capture, then a
//      divider and the shipping-from address + social icons BELOW it.
//
// Bottom bar: copyright (left), legal links (right) — Privacy Policy, Refund
// Policy and Terms of Service open as pop-up dialogs (FooterLegal); the store
// is headless, so there are no Shopify policy pages to link to.
//
// Boundaries: this file has no 'use client' directive, but it is imported by
// the 'use client' LayoutWrapper, so Next bundles it into the client tree. It
// therefore uses no server-only imports. Static data comes from lib/content
// (already a sync getter today). If dynamic Shopify data is needed later,
// render the footer as a Server Component passed via children, not imported here.
// ---------------------------------------------------------------------------

const shopLinks = [
  { label: 'Shop', href: '/shop' },
  { label: 'Our Story', href: '/story' },
];

const supportLinks = [
  { label: 'Help Center', href: '/help' },
  { label: 'Contact Us', href: '/contact' },
];

// Brand socials — Instagram + TikTok only (per brand direction). Both open
// in a new tab; Lucide ships Instagram, so only TikTok is an inline glyph below.
const socials = [
  { label: 'Instagram', href: 'https://www.instagram.com/apeiron.nyc/?hl=en', icon: Instagram },
  { label: 'TikTok', href: 'https://www.tiktok.com/@apeiron.nyc', icon: TikTokIcon },
];

// ---------------------------------------------------------------------------
// Inline SVG for the TikTok logo (Lucide does not ship a branded TikTok icon).
// ---------------------------------------------------------------------------
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.86-.5-4.09-1.27-.01 2.86.01 5.71-.02 8.57-.07 1.53-.69 3.04-1.77 4.13-1.35 1.38-3.36 2.12-5.36 1.86-2.05-.25-3.95-1.6-4.84-3.45-1.01-2.06-.62-4.71.97-6.36 1.04-1.08 2.58-1.74 4.11-1.71.02 1.43-.04 2.86-.03 4.29-.71-.23-1.54-.08-2.13.49-.71.59-.93 1.66-.55 2.49.36.86 1.34 1.4 2.26 1.28.91-.1 1.7-.85 1.91-1.74.12-.66.07-1.34.08-2.01.02-4.21 0-8.42.02-12.63z" />
    </svg>
  );
}

function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-4 text-primary-cream uppercase tracking-widest text-xs font-bold hover:text-accent-energy transition-colors"
    >
      <span className="min-w-[7rem]">{children}</span>
      <ArrowIcon className="w-4 h-4 text-primary-cream group-hover:text-accent-energy transition-colors" />
    </Link>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function Footer() {
  const { address } = getContactContent();
  const year = new Date().getFullYear();

  return (
    <footer className="cv-auto bg-apeiron-black text-apeiron-ivory border-t border-ui-concrete/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
          {/* Brand block — small APEIRON® wordmark: tight tracking + ® (per
              the brand banner), deliberately DIFFERENT from the header lockup
              (wide tracking + Japanese tagline, which stays header-only). */}
          <div className="col-span-2 lg:col-span-1 flex flex-col gap-4">
            <div className="flex flex-col items-start">
              <Link href="/" className="group">
                <h2 className="text-lg font-semibold uppercase tracking-tight text-apeiron-ivory leading-none">
                  Apeiron<sup className="text-[0.55em] font-normal">®</sup>
                </h2>
              </Link>
            </div>
          </div>

          {/* Shop links — left column (no group label) */}
          <nav aria-label="Shop" className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              {shopLinks.map((link) => (
                <ArrowLink key={link.href} href={link.href}>{link.label}</ArrowLink>
              ))}
            </div>
          </nav>

          {/* Support links — the column on the right (no group label) */}
          <nav aria-label="Support" className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              {supportLinks.map((link) => (
                <ArrowLink key={link.href} href={link.href}>{link.label}</ArrowLink>
              ))}
            </div>
          </nav>

          {/* Join the List + shipping/socials below it */}
          <div className="col-span-2 lg:col-span-1 flex flex-col gap-4">
            <h2 className="text-ui-concrete uppercase tracking-widest text-xs font-bold">
              Join the List
            </h2>
            <p className="text-ui-concrete text-xs leading-relaxed">
              Early access to new drops and studio collaborations.
            </p>
            <NewsletterForm />

            <hr className="border-ui-concrete/20 w-full my-0" />

            <div className="flex flex-col gap-3">
              <address className="not-italic text-ui-concrete text-xs uppercase tracking-widest flex items-start gap-2">
                <LocationIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Shipping from {address}</span>
              </address>

              <ul className="flex items-center gap-4">
                {socials.map(({ label, href, icon: Icon }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target={href.startsWith('mailto') ? undefined : '_blank'}
                      rel={href.startsWith('mailto') ? undefined : 'noopener noreferrer'}
                      aria-label={`${label}${href.startsWith('mailto') ? '' : ' (opens in a new tab)'}`}
                      className="text-ui-concrete hover:text-primary-cream transition-colors"
                    >
                      <Icon className="w-5 h-5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-6 border-t border-ui-concrete/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p
            suppressHydrationWarning
            className="text-ui-concrete uppercase tracking-widest text-[10px] font-bold"
          >
            &copy; {year} Apeiron. All rights reserved.
          </p>

          <FooterLegal />
        </div>
      </div>
    </footer>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
      />
    </svg>
  );
}
