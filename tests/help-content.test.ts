import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Help Center content tests (lib/help-content.ts).
//
// The merchant edits Help Center Q&A as metaobjects in Shopify admin; the page
// reads TWO definition handles (`faq_entry` preferred, `help_question` as the
// documented recreated-definition handle) because a definition's type handle
// is fixed at creation time. Contracts under test: field parsing (`category`
// with `section` alias), position ordering (stable when absent), section
// grouping, skipping unusable entries, handle preference, and the static
// fallback.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));
vi.mock('@/lib/shopify/client', () => ({ shopifyRequest: vi.fn() }));

const { mapHelpQuestions, getHelpSections } = await import('@/lib/help-content');
const { shopifyRequest } = await import('@/lib/shopify/client');
const { getHelpContent } = await import('@/lib/content');
const mockRequest = vi.mocked(shopifyRequest);

/** Build a metaobjects-connection node from a fields object. */
function entry(fields: Record<string, string>) {
  return {
    node: {
      fields: Object.entries(fields).map(([key, value]) => ({ key, value })),
    },
  };
}

function connection(...nodes: ReturnType<typeof entry>[]) {
  return { edges: nodes };
}

beforeEach(() => {
  mockRequest.mockReset();
});

describe('mapHelpQuestions', () => {
  it('maps fields to sections with question/answer items (category key)', () => {
    const sections = mapHelpQuestions(
      connection(
        entry({ category: 'Orders', question: 'When does my order ship?', answer: 'Within 1–2 days.', position: '1' }),
        entry({ category: 'Shipping', question: 'How much is shipping?', answer: 'Free over $200.', position: '2' }),
      ),
    );
    expect(sections).toEqual([
      { heading: 'Orders', items: [{ question: 'When does my order ship?', answer: 'Within 1–2 days.' }] },
      { heading: 'Shipping', items: [{ question: 'How much is shipping?', answer: 'Free over $200.' }] },
    ]);
  });

  it('accepts `section` as an alias for the category key', () => {
    const sections = mapHelpQuestions(
      connection(entry({ section: 'Orders', question: 'Q', answer: 'A' })),
    );
    expect(sections[0].heading).toBe('Orders');
  });

  it('orders entries by position and groups same-section entries together', () => {
    const sections = mapHelpQuestions(
      connection(
        entry({ category: 'Shipping', question: 'Q3', answer: 'A3', position: '3' }),
        entry({ category: 'Orders', question: 'Q1', answer: 'A1', position: '1' }),
        entry({ category: 'Orders', question: 'Q2', answer: 'A2', position: '2' }),
      ),
    );
    expect(sections.map((s) => s.heading)).toEqual(['Orders', 'Shipping']);
    expect(sections[0].items.map((i) => i.question)).toEqual(['Q1', 'Q2']);
  });

  it('preserves Shopify return order when no position is set anywhere', () => {
    const sections = mapHelpQuestions(
      connection(
        entry({ category: 'Orders', question: 'First', answer: 'A' }),
        entry({ category: 'Orders', question: 'Second', answer: 'A' }),
        entry({ category: 'Orders', question: 'Third', answer: 'A' }),
      ),
    );
    expect(sections[0].items.map((i) => i.question)).toEqual(['First', 'Second', 'Third']);
  });

  it('skips entries missing a question or an answer', () => {
    const sections = mapHelpQuestions(
      connection(
        entry({ category: 'Orders', question: '', answer: 'A' }),
        entry({ category: 'Orders', question: 'Q', answer: '  ' }),
        entry({ category: 'Orders', question: 'Kept?', answer: 'Kept.' }),
      ),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].items).toEqual([{ question: 'Kept?', answer: 'Kept.' }]);
  });

  it('defaults an empty category to General', () => {
    const sections = mapHelpQuestions(
      connection(entry({ category: '', question: 'No section', answer: 'A' })),
    );
    expect(sections[0].heading).toBe('General');
  });

  it('returns an empty array when no entries exist (caller falls back)', () => {
    expect(mapHelpQuestions(connection())).toEqual([]);
  });
});

describe('getHelpSections — handle preference + fallback', () => {
  it('prefers faq_entry entries over help_question entries', async () => {
    mockRequest.mockResolvedValueOnce({
      faqEntries: connection(entry({ category: 'Orders', question: 'From faq_entry', answer: 'A' })),
      helpQuestions: connection(entry({ category: 'Orders', question: 'From help_question', answer: 'A' })),
    });
    const sections = await getHelpSections();
    expect(sections[0].items[0].question).toBe('From faq_entry');
  });

  it('uses help_question entries when faq_entry has none', async () => {
    mockRequest.mockResolvedValueOnce({
      faqEntries: connection(),
      helpQuestions: connection(entry({ category: 'Orders', question: 'From help_question', answer: 'A' })),
    });
    const sections = await getHelpSections();
    expect(sections[0].items[0].question).toBe('From help_question');
  });

  it('falls back to the static defaults when neither handle has entries', async () => {
    mockRequest.mockResolvedValueOnce({ faqEntries: connection(), helpQuestions: connection() });
    expect(await getHelpSections()).toEqual(getHelpContent());
  });

  it('falls back to the static defaults when Shopify is unreachable', async () => {
    mockRequest.mockRejectedValueOnce(new Error('network down'));
    expect(await getHelpSections()).toEqual(getHelpContent());
  });
});
