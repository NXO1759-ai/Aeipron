// ---------------------------------------------------------------------------
// lib/content — static Help/FAQ + Contact Us content.
//
// STATIC NOW, DYNAMIC LATER. This module is the single place the two standalone
// content pages (/help, /contact) read their copy from, and the single place the
// footer reads its studio-origin line from. Today it returns hardcoded data.
//
// SWAP COST (be honest about it): when Shopify is set up to deliver page content
// (via a Shopify Page `page(handle:)` — which needs the `unauthenticated_read_content`
// scope, currently off per docs/SHOPIFY_API.md — or a metaobject), swap the BODIES
// of `getHelpContent` / `getContactContent` for those fetches. That swap is NOT a
// pure one-function change: making these async requires adding `await` at the call
// sites in both pages AND `export const dynamic = 'force-dynamic'` on both pages,
// because a network fetch opts the route out of static prerender. If Shopify
// returns HTML bodies (it does for `page.body`), `answer: string` must also widen
// (e.g. to a `plain | rich` discriminated union) and the /help renderer must switch
// from text to a sanitized-HTML renderer (dangerouslySetInnerHTML + a sanitizer).
// This module centralizes the DATA seam; the page + type changes that follow are
// localized and documented, not avoided. This mirrors the mock→Shopify pattern
// already used in lib/catalog.ts (organizers stay mock-backed "until Phase 4").
//
// No server-only imports here today: these are plain, synchronous data-accessors.
// The pages that consume them are static Server Components (prerendered at build
// time). When the swap adds a network fetch, these become async and the pages
// become dynamic — at which point server-only imports become permissible here.
// ---------------------------------------------------------------------------

/** A single FAQ accordion section: a heading plus its Q/A pairs. */
export type HelpFaqSection = {
  heading: string;
  items: { question: string; answer: string }[];
};

/** Contact information for the /contact page. */
export type ContactInfo = {
  email: string;
  phone?: string;
  address: string;
  hours?: string;
  socials?: { label: string; href: string }[];
};

/** Static FAQ content. Replace the body with a Shopify fetch in the dynamic phase. */
export function getHelpContent(): HelpFaqSection[] {
  return [
    {
      heading: 'Orders',
      items: [
        {
          question: 'How long until my order ships?',
          answer:
            'Orders are processed within 1–2 business days. You will receive a confirmation email with tracking once your order leaves our New York studio.',
        },
        {
          question: 'Can I change or cancel my order after placing it?',
          answer:
            'We begin processing quickly, so changes or cancellations are not guaranteed. Email us as soon as possible and we will do our best to catch it before it ships.',
        },
        {
          question: 'Do you ship internationally?',
          answer:
            'Yes. We ship worldwide. Shipping costs and duties are calculated at checkout based on your destination.',
        },
      ],
    },
    {
      heading: 'Shipping',
      items: [
        {
          question: 'How much does shipping cost?',
          answer:
            'Complimentary express shipping is included on all orders over $200. Below that, a flat rate is applied at checkout.',
        },
        {
          question: 'When will my order arrive?',
          answer:
            'Domestic orders typically arrive in 2–4 business days. International delivery times vary by destination, usually 5–10 business days.',
        },
      ],
    },
    {
      heading: 'Returns & Exchanges',
      items: [
        {
          question: 'What is your return policy?',
          answer:
            'Unworn items in original condition may be returned within 14 days of delivery for a full refund.',
        },
        {
          question: 'How do I start a return?',
          answer:
            'Email us with your order number and we will send a return authorization and shipping instructions.',
        },
      ],
    },
  ];
}

/** Static contact information. Replace the body with a Shopify fetch in the dynamic phase. */
export function getContactContent(): ContactInfo {
  return {
    email: 'hello@wearapeiron.com',
    address: 'New York, USA',
    hours: 'Studio hours: Mon–Fri, 9am–6pm ET',
    socials: [
      { label: 'Instagram', href: 'https://www.instagram.com/apeiron.nyc/?hl=en' },
      { label: 'TikTok', href: 'https://www.tiktok.com/@apeiron.nyc' },
    ],
  };
}
