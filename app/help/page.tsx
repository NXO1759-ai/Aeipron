import type { Metadata } from 'next';
import Link from 'next/link';
import { getHelpSections } from '@/lib/help-content';
import { Disclosure } from '@/components/Disclosure';

// ---------------------------------------------------------------------------
// /help — the Help Center page.
//
// Content is merchant-editable in Shopify (Settings → Custom data →
// Metaobjects → Help question; see lib/help-content.ts for the field contract)
// and falls back to the static defaults in lib/content when no entries exist,
// so the page always renders. Fetched via ISR (`revalidate = 300`): edits in
// Shopify appear within five minutes without a redeploy, and Shopify is not
// hit on every page view. These pages ARE canonical, linkable destinations —
// unlike /cart, they SHOULD be indexed, so there is no robots:noindex here.
//
// LAYOUT: top padding is owned by LayoutWrapper's <main className="pt-24">. We
// add extra top breathing room (`pt-10 md:pt-16`) so the eyebrow is not glued to
// the fixed header, plus bottom padding matching the /collection convention.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Help Center — Apeiron',
  description:
    'Answers to common questions about orders, shipping, and returns at Apeiron.',
};

export const revalidate = 300;

// Slugify a section heading into a stable, DOM-id-safe value (no spaces / `&`).
// Used for the section id, aria-labelledby, and the React key — so the accessible
// name always resolves and keys stay unique even if two headings ever collide.
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default async function HelpPage() {
  const sections = await getHelpSections();

  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory">
      <div className="max-w-3xl mx-auto px-4 md:px-12 pt-10 md:pt-16 pb-24 md:pb-32">
        <header className="mb-12 md:mb-16">
          <p className="text-xs uppercase tracking-widest text-ui-concrete mb-4">Support</p>
          <h1 className="font-inter text-4xl md:text-5xl font-medium uppercase tracking-tighter">
            Help Center
          </h1>
          <p className="mt-4 text-ui-concrete leading-relaxed max-w-xl">
            Quick answers to the questions we hear most. Can&rsquo;t find what you&rsquo;re looking
            for? Reach us on the{' '}
            <Link
              href="/contact"
              className="text-primary-cream underline underline-offset-4 hover:text-accent-energy transition-colors"
            >
              contact page
            </Link>
            .
          </p>
        </header>

        <div className="space-y-10">
          {sections.map((section) => {
            const slug = slugify(section.heading);
            return (
              <section key={slug} aria-labelledby={`faq-${slug}`}>
                <h2
                  id={`faq-${slug}`}
                  className="text-lg font-bold uppercase tracking-widest text-primary-cream mb-4"
                >
                  {section.heading}
                </h2>
                <div className="space-y-1">
                  {section.items.map((item, index) => (
                    <Disclosure key={`${slug}-${index}`} summary={item.question}>
                      {/* Metaobject answers are multi-line plain text — each
                          non-empty line renders as its own paragraph. */}
                      {item.answer
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line, lineIndex) => (
                          <p key={lineIndex} className="[&:not(:first-child)]:mt-2">
                            {line}
                          </p>
                        ))}
                    </Disclosure>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
