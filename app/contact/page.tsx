import type { Metadata } from 'next';
import { ContactForm } from './ContactForm';

// ---------------------------------------------------------------------------
// /contact — the Contact Us page.
//
// A static Server Component (prerendered at build time — no fetch, no
// `force-dynamic`). Per the brand's direction the page no longer lists email,
// studio address, hours, or social links — it is just the heading, a short
// intro, and the message form. (Those detail blocks were removed from this
// page only; the site-wide footer still shows the shipping-from address and
// socials.)
//
// The ContactForm is a client island inside this static page: the page stays
// prerendered + indexable, while the form submits via a server action that
// emails the message to the store inbox (hello@wearapeiron.com) and records a
// `contact_message` metaobject in Shopify via the Admin API. The storefront
// `/contact` POST endpoint is NOT used — it is protected by Cloudflare bot
// management + Shopify storefront-form captcha, both of which block headless
// submissions (see app/contact/actions.ts for the full rationale).
//
// LAYOUT: top padding is owned by LayoutWrapper's <main className="pt-24">. We
// add extra top breathing room (`pt-10 md:pt-16`) so the eyebrow is not glued to
// the fixed header, plus bottom padding matching the /collection convention.
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Contact Us — Apeiron',
  description: 'Send a message to the Apeiron team. Every message is read — we reply within one business day.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory">
      <div className="max-w-3xl mx-auto px-4 md:px-12 pt-10 md:pt-16 pb-24 md:pb-32">
        <header className="mb-12 md:mb-16">
          <p className="text-xs uppercase tracking-widest text-ui-concrete mb-4">Support</p>
          <h1 className="font-inter text-4xl md:text-5xl font-medium uppercase tracking-tighter">
            Contact Us
          </h1>
          <p className="mt-4 text-ui-concrete leading-relaxed max-w-xl">
            Whatever&rsquo;s on your mind — an order, a fit question, or just saying hello —
            we&rsquo;re here to help. Every message is read by our team, and you&rsquo;ll hear back
            from us within one business day.
          </p>
        </header>
        <section>
          <h2 className="text-lg font-bold uppercase tracking-widest text-primary-cream mb-8">
            Send us a message
          </h2>
          <ContactForm />
        </section>
      </div>
    </div>
  );
}
