// ---------------------------------------------------------------------------
// lib/content — static Help/FAQ fallback + Contact Us content.
//
// HELP CENTER: the /help page reads merchant-editable `help_question`
// metaobjects from Shopify via lib/help-content.ts — `getHelpContent()` here
// is the STATIC FALLBACK rendered when no entries exist or Shopify is
// unreachable, so the Help Center can never go blank. Keep this fallback
// roughly in sync with the metaobject entries.
//
// CONTACT: `getContactContent` is still the single source for the contact
// details (the footer's shipping-from line). If Shopify ever delivers that
// copy (a Page via `page(handle:)` needs the `unauthenticated_read_content`
// scope, currently off per docs/SHOPIFY_API.md), swap the body for that
// fetch — the call sites (Footer) must then become async-capable.
//
// No server-only imports here: these are plain, synchronous data-accessors
// and Footer (bundled into the client tree) imports getContactContent. The
// Shopify fetch lives in lib/help-content.ts (server-only) for that reason.
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

/** Static FAQ fallback — rendered when no help_question metaobjects exist. */
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
