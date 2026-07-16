import Link from 'next/link';
import { Instagram, Youtube, Mail } from 'lucide-react';
import { getContactContent } from '@/lib/content';
import { NewsletterForm } from './NewsletterForm';

// ---------------------------------------------------------------------------
// Footer — redesigned site-wide footer (reference image).
//
// Four columns on desktop:
//   1. Brand block — Apeiron text lockup (matches Header), Japanese tagline,
//      body copy, divider, shipping-from address, social icons.
//   2. Shop links — Collection, Our Story (with arrows).
//   3. Support links — Help / FAQ, Contact Us (with arrows).
//   4. Stay in the Loop — newsletter copy + NewsletterForm email capture.
//
// Bottom bar: copyright (left), Privacy Policy + Terms of Service (right).
//
// Boundaries: this file has no 'use client' directive, but it is imported by
// the 'use client' LayoutWrapper, so Next bundles it into the client tree. It
// therefore uses no server-only imports. Static data comes from lib/content
// (already a sync getter today). If dynamic Shopify data is needed later,
// render the footer as a Server Component passed via children, not imported here.
// ---------------------------------------------------------------------------

const shopLinks = [
  { label: 'Collection', href: '/collection' },
  { label: 'Our Story', href: '/story' },
];

const supportLinks = [
  { label: 'Help / FAQ', href: '/help' },
  { label: 'Contact Us', href: '/contact' },
];

const socials = [
  { label: 'Instagram', href: 'https://instagram.com/apeiron', icon: Instagram },
  { label: 'X', href: 'https://x.com/apeiron', icon: XIcon },
  { label: 'YouTube', href: 'https://youtube.com/apeiron', icon: Youtube },
  { label: 'Email', href: 'mailto:hello@apeiron.com', icon: Mail },
];

// ---------------------------------------------------------------------------
// Inline SVG for the X logo (Lucide does not ship a branded X icon).
// ---------------------------------------------------------------------------
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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
    <footer className="bg-apeiron-black text-apeiron-ivory border-t border-ui-concrete/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* Brand block */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-start">
              <Link href="/" className="group">
                <h2 className="text-2xl font-bold uppercase tracking-[0.2em] text-apeiron-ivory leading-none">
                  Apeiron
                </h2>
              </Link>
              <span className="text-[10px] text-apeiron-ivory tracking-[0.3em] mt-1 leading-none font-medium">
                アペイロン
              </span>
            </div>

            <p className="text-ui-concrete text-xs leading-relaxed max-w-xs">
              Tools and apparel designed to elevate your everyday. Built with
              purpose, crafted to last.
            </p>

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

          {/* Shop */}
          <nav aria-label="Shop" className="flex flex-col gap-4">
            <h2 className="text-ui-concrete uppercase tracking-widest text-xs font-bold">
              Shop
            </h2>
            <div className="flex flex-col gap-3">
              {shopLinks.map((link) => (
                <ArrowLink key={link.href} href={link.href}>{link.label}</ArrowLink>
              ))}
            </div>
          </nav>

          {/* Support */}
          <nav aria-label="Support" className="flex flex-col gap-4">
            <h2 className="text-ui-concrete uppercase tracking-widest text-xs font-bold">
              Support
            </h2>
            <div className="flex flex-col gap-3">
              {supportLinks.map((link) => (
                <ArrowLink key={link.href} href={link.href}>{link.label}</ArrowLink>
              ))}
            </div>
          </nav>

          {/* Stay in the Loop */}
          <div className="flex flex-col gap-4">
            <h2 className="text-ui-concrete uppercase tracking-widest text-xs font-bold">
              Stay in the Loop
            </h2>
            <p className="text-ui-concrete text-xs leading-relaxed">
              Be the first to know about new drops, exclusive offers, and more.
            </p>
            <NewsletterForm />
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

          <div className="flex items-center gap-6">
            <Link
              href="#"
              className="text-ui-concrete uppercase tracking-widest text-[10px] font-bold hover:text-primary-cream transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="#"
              className="text-ui-concrete uppercase tracking-widest text-[10px] font-bold hover:text-primary-cream transition-colors"
            >
              Terms of Service
            </Link>
          </div>
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