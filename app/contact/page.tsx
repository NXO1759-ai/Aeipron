import type { Metadata } from 'next';
import { getContactContent } from '@/lib/content';

// ---------------------------------------------------------------------------
// /contact — the Contact Us page.
//
// A static Server Component (prerendered at build time — no fetch, no
// `force-dynamic`) that renders contact details from lib/content. Static for
// now; a later phase swaps getContactContent() for a Shopify Page/metaobject
// fetch (see lib/content.ts for the real swap cost). Canonical, linkable —
// SHOULD be indexed (no robots:noindex). External links (socials) open in a new
// tab, are safe-rel annotated, and announce that via aria-label.
//
// LAYOUT: top padding is owned by LayoutWrapper's <main className="pt-24">, so
// this page adds bottom padding only (matching the /collection convention).
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Contact Us — Apeiron',
  description: 'Get in touch with the Apeiron studio in New York. Email, hours, and social.',
};

export default function ContactPage() {
  const info = getContactContent();

  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory">
      <div className="max-w-3xl mx-auto px-4 md:px-12 pb-24 md:pb-32">
        <header className="mb-12 md:mb-16">
          <p className="text-xs uppercase tracking-widest text-ui-concrete mb-4">Support</p>
          <h1 className="font-inter text-4xl md:text-5xl font-medium uppercase tracking-tighter">
            Contact Us
          </h1>
          <p className="mt-4 text-ui-concrete leading-relaxed max-w-xl">
            Questions, collaborations, or just saying hello — we read everything. We typically reply
            within one business day.
          </p>
        </header>

        <dl className="space-y-8">
          <div>
            <dt className="text-xs uppercase tracking-widest text-ui-concrete mb-2">Email</dt>
            <dd>
              <a
                href={`mailto:${info.email}`}
                className="text-lg text-primary-cream underline underline-offset-4 hover:text-accent-energy transition-colors"
              >
                {info.email}
              </a>
            </dd>
          </div>

          {info.phone ? (
            <div>
              <dt className="text-xs uppercase tracking-widest text-ui-concrete mb-2">Phone</dt>
              <dd className="text-lg text-primary-cream">{info.phone}</dd>
            </div>
          ) : null}

          <div>
            <dt className="text-xs uppercase tracking-widest text-ui-concrete mb-2">Studio</dt>
            <dd className="text-lg text-primary-cream">{info.address}</dd>
          </div>

          {info.hours ? (
            <div>
              <dt className="text-xs uppercase tracking-widest text-ui-concrete mb-2">Hours</dt>
              <dd className="text-lg text-primary-cream">{info.hours}</dd>
            </div>
          ) : null}

          {info.socials && info.socials.length > 0 ? (
            <div>
              <dt className="text-xs uppercase tracking-widest text-ui-concrete mb-2">Follow</dt>
              <dd>
                <ul className="flex flex-wrap gap-x-6 gap-y-2">
                  {info.socials.map((social) => (
                    <li key={social.label}>
                      <a
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${social.label} (opens in a new tab)`}
                        className="text-lg text-primary-cream underline underline-offset-4 hover:text-accent-energy transition-colors"
                      >
                        {social.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}