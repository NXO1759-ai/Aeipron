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
            'Orders leave our studio within 1–2 business days. You\'ll get tracking by email the moment yours is on its way.\nBecause SKUs are limited, we pack and ship in the order in which purchases come in.',
        },
        {
          question: 'Can I change or cancel my order after placing it?',
          answer:
            'Yes, if you\'re quick. Email us within 24 hours of ordering and we\'ll update the address, swap a size, or cancel outright.\nAfter that window, the order is usually already packed, but reach out anyway, and we\'ll do what we can.',
        },
        {
          question: 'Do you ship internationally?',
          answer:
            'Yes, worldwide. International orders are shipped; your local customs office may charge import duties or taxes on arrival, and those are on you.\nIt\'s the standard arrangement for international apparel; we don\'t control the rates and can\'t predict them.',
        },
      ],
    },
    {
      heading: 'Shipping',
      items: [
        {
          question: 'How much does shipping cost?',
          answer:
            'Domestic shipping is free on orders over $70, and courier rates apply to orders below that.\nInternational rates are calculated at checkout by destination and weight; you\'ll see the exact number before you pay.',
        },
        {
          question: 'When will my order arrive?',
          answer:
            'Domestic: 3–5 business days from shipment. International: 7–14 business days, depending on destination and customs.\nEvery order includes tracking, so you\'ll never have to guess.',
        },
      ],
    },
    {
      heading: 'Returns & Exchanges',
      items: [
        {
          question: 'What is your return policy?',
          answer:
            'You have 30 days from delivery to return unworn or unused pieces, with tags, in their original packaging, for a refund to your original payment method.\nThat\'s the standard window, and we keep it simple: no restocking fees, no interrogation.\nOne note: because SKUs are limited runs, returned pieces go through inspection before they re-enter stock.',
        },
        {
          question: 'How do I start a return?',
          answer:
            'Email us hello@wearapeiron.com with your order number and what you\'re sending back.\nOnce your return is accepted, we\'ll send you a return shipping label and instructions on how and where to send your package.\nRefunds are processed within 10 business days of the return arriving.',
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
