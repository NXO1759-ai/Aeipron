import 'server-only';

// ---------------------------------------------------------------------------
// Help Center content — Shopify-backed with a static fallback.
//
// The merchant edits the Help Center from Shopify admin: Settings → Custom
// data → Metaobjects → Help question — one `help_question` metaobject per
// accordion item:
//   section  (single_line_text) — the accordion group, e.g. "Orders"
//   question (single_line_text) — the disclosure summary
//   answer   (multi_line_text)  — the disclosure body (plain text; each line
//                                 renders as its own paragraph)
//   position (number_integer)   — manual sort order, ascending
// The definition needs Storefront API access (enabled by default when created
// through "Add definition").
//
// Fallback contract: getHelpSections NEVER throws. If the feature isn't set
// up yet, Shopify is unreachable, or every entry is unusable, the static
// defaults from lib/content render instead — the page can't 500 over content.
// ---------------------------------------------------------------------------

import { getHelpContent, type HelpFaqSection } from '@/lib/content';
import { shopifyRequest } from '@/lib/shopify/client';
import { HELP_QUESTIONS_QUERY } from '@/lib/shopify/queries';
import type { ShopifyMetaobjectsResponse } from '@/lib/shopify/types';

/** Section used when an entry leaves `section` empty. */
const DEFAULT_SECTION = 'General';

/** One parsed Q&A entry from the metaobject fields. */
interface HelpQuestionEntry {
  section: string;
  question: string;
  answer: string;
  position: number;
}

/** Read the four known fields out of a metaobject node's key/value list. */
function parseEntry(node: { fields: { key: string; value: string | null }[] }): HelpQuestionEntry | null {
  const fields = new Map(node.fields.map((f) => [f.key, (f.value ?? '').trim()]));
  const question = fields.get('question') ?? '';
  const answer = fields.get('answer') ?? '';
  // An entry without both a question and an answer can't render — skip it.
  if (!question || !answer) return null;
  const position = Number.parseInt(fields.get('position') ?? '', 10);
  return {
    section: fields.get('section') || DEFAULT_SECTION,
    question,
    answer,
    position: Number.isNaN(position) ? Number.MAX_SAFE_INTEGER : position,
  };
}

/**
 * Map the raw metaobjects response to accordion sections. Entries sort by
 * `position` ascending; sections appear in the order their first entry does.
 * Exported (pure) so the mapping is unit-tested without mocking the network.
 */
export function mapHelpQuestions(data: ShopifyMetaobjectsResponse): HelpFaqSection[] {
  const entries = data.metaobjects.edges
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
 * The Help Center sections: Shopify metaobjects when configured, static
 * defaults otherwise. Awaited by the /help page (revalidated, not per-hit).
 */
export async function getHelpSections(): Promise<HelpFaqSection[]> {
  try {
    const data = await shopifyRequest<ShopifyMetaobjectsResponse>(HELP_QUESTIONS_QUERY);
    const sections = mapHelpQuestions(data);
    return sections.length > 0 ? sections : getHelpContent();
  } catch {
    // Unreachable/misconfigured Shopify must never take the Help Center down.
    return getHelpContent();
  }
}
