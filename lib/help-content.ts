import 'server-only';

// ---------------------------------------------------------------------------
// Help Center content — Shopify-backed with a static fallback.
//
// The merchant edits the Help Center from Shopify admin: Settings → Custom
// data → Metaobjects — one metaobject per accordion item:
//   question (single_line_text) — the disclosure summary
//   answer   (multi_line_text)  — the disclosure body (plain text; each line
//                                 renders as its own paragraph)
//   category (single_line_text) — the accordion group, e.g. "Orders"
//                                 (`section` is accepted too, for a recreated
//                                 definition that uses that key)
//   position (number_integer)   — OPTIONAL manual sort order, ascending; when
//                                 absent, Shopify's return order is preserved
//
// TYPE HANDLE: a definition's type handle is fixed at creation time —
// renaming the display name in admin does NOT change it. This store's
// definition was created as `faq_entry` and later renamed "Help Question",
// so the query reads BOTH handles in one round trip (lib/shopify/queries.ts):
// `faq_entry` wins when it has entries, `help_question` is the documented
// handle for a recreated definition. The definition needs Storefront API
// access enabled.
//
// Fallback contract: getHelpSections NEVER throws. If neither handle has
// usable entries or Shopify is unreachable, the static defaults from
// lib/content render instead — the page can't 500 over content.
// ---------------------------------------------------------------------------

import { getHelpContent, type HelpFaqSection } from '@/lib/content';
import { shopifyRequest } from '@/lib/shopify/client';
import { HELP_QUESTIONS_QUERY } from '@/lib/shopify/queries';
import type {
  ShopifyHelpQuestionsResponse,
  ShopifyMetaobjectConnection,
} from '@/lib/shopify/types';

/** Section used when an entry leaves the category/section field empty. */
const DEFAULT_SECTION = 'General';

/** One parsed Q&A entry from the metaobject fields. */
interface HelpQuestionEntry {
  section: string;
  question: string;
  answer: string;
  position: number;
}

/** Read the known fields out of a metaobject node's key/value list. */
function parseEntry(node: { fields: { key: string; value: string | null }[] }): HelpQuestionEntry | null {
  const fields = new Map(node.fields.map((f) => [f.key, (f.value ?? '').trim()]));
  const question = fields.get('question') ?? '';
  const answer = fields.get('answer') ?? '';
  // An entry without both a question and an answer can't render — skip it.
  if (!question || !answer) return null;
  const position = Number.parseInt(fields.get('position') ?? '', 10);
  return {
    // `category` is the live definition's key; `section` accepted as an alias.
    section: fields.get('category') || fields.get('section') || DEFAULT_SECTION,
    question,
    answer,
    // Missing/unparseable positions sort last; the sort is stable, so an
    // all-positionless list keeps Shopify's return order.
    position: Number.isNaN(position) ? Number.MAX_SAFE_INTEGER : position,
  };
}

/**
 * Map one metaobjects connection to accordion sections. Entries sort by
 * `position` ascending (stable — positionless lists keep Shopify's order);
 * sections appear in the order their first entry does. Exported (pure) so the
 * mapping is unit-tested without mocking the network.
 */
export function mapHelpQuestions(connection: ShopifyMetaobjectConnection): HelpFaqSection[] {
  const entries = connection.edges
    .map((edge) => parseEntry(edge.node))
    .filter((entry): entry is HelpQuestionEntry => entry !== null)
    .sort((a, b) => a.position - b.position);

  const sections = new Map<string, { question: string; answer: string }[]>();
  for (const entry of entries) {
    const items = sections.get(entry.section) ?? [];
    items.push({ question: entry.question, answer: entry.answer });
    sections.set(entry.section, items);
  }
  return Array.from(sections.entries()).map(([heading, items]) => ({ heading, items }));
}

/**
 * The Help Center sections: `faq_entry` metaobjects when present, else
 * `help_question`, else the static defaults. Awaited by the /help page
 * (revalidated, not per-hit).
 */
export async function getHelpSections(): Promise<HelpFaqSection[]> {
  try {
    const data = await shopifyRequest<ShopifyHelpQuestionsResponse>(HELP_QUESTIONS_QUERY);
    const faqSections = mapHelpQuestions(data.faqEntries);
    if (faqSections.length > 0) return faqSections;
    const helpSections = mapHelpQuestions(data.helpQuestions);
    if (helpSections.length > 0) return helpSections;
    return getHelpContent();
  } catch (err) {
    // Unreachable/misconfigured Shopify must never take the Help Center down.
    console.error('[help] fetch failed, using static fallback:', err instanceof Error ? err.message : err);
    return getHelpContent();
  }
}
