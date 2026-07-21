import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Help Center content mapping tests (lib/help-content.ts).
//
// The merchant edits Help Center Q&A as `help_question` metaobjects in Shopify
// admin; mapHelpQuestions turns the raw key/value fields into the accordion
// sections the page renders. Contracts under test: field parsing, position
// ordering, section grouping (first-seen order), skipping unusable entries,
// and the empty-result shape that triggers the static fallback.
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

// The module imports the Shopify client; the pure mapper never calls it, but
// the import must resolve under Vitest.
vi.mock('@/lib/shopify/client', () => ({ shopifyRequest: vi.fn() }));

const { mapHelpQuestions } = await import('@/lib/help-content');

/** Build a metaobjects-response node from a fields object. */
function entry(fields: Record<string, string>) {
  return {
    node: {
      fields: Object.entries(fields).map(([key, value]) => ({ key, value })),
    },
  };
}

function response(...nodes: ReturnType<typeof entry>[]) {
  return { metaobjects: { edges: nodes } };
}

describe('mapHelpQuestions', () => {
  it('maps fields to sections with question/answer items', () => {
    const sections = mapHelpQuestions(
      response(
        entry({ section: 'Orders', question: 'When does my order ship?', answer: 'Within 1–2 days.', position: '1' }),
        entry({ section: 'Shipping', question: 'How much is shipping?', answer: 'Free over $200.', position: '2' }),
      ),
    );
    expect(sections).toEqual([
      { heading: 'Orders', items: [{ question: 'When does my order ship?', answer: 'Within 1–2 days.' }] },
      { heading: 'Shipping', items: [{ question: 'How much is shipping?', answer: 'Free over $200.' }] },
    ]);
  });

  it('orders entries by position and groups same-section entries together', () => {
    const sections = mapHelpQuestions(
      response(
        entry({ section: 'Shipping', question: 'Q3', answer: 'A3', position: '3' }),
        entry({ section: 'Orders', question: 'Q1', answer: 'A1', position: '1' }),
        entry({ section: 'Orders', question: 'Q2', answer: 'A2', position: '2' }),
      ),
    );
    expect(sections.map((s) => s.heading)).toEqual(['Orders', 'Shipping']);
    expect(sections[0].items.map((i) => i.question)).toEqual(['Q1', 'Q2']);
  });

  it('skips entries missing a question or an answer', () => {
    const sections = mapHelpQuestions(
      response(
        entry({ section: 'Orders', question: '', answer: 'A', position: '1' }),
        entry({ section: 'Orders', question: 'Q', answer: '  ', position: '2' }),
        entry({ section: 'Orders', question: 'Kept?', answer: 'Kept.', position: '3' }),
      ),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].items).toEqual([{ question: 'Kept?', answer: 'Kept.' }]);
  });

  it('defaults an empty section to General and sorts positionless entries last', () => {
    const sections = mapHelpQuestions(
      response(
        entry({ section: '', question: 'No section', answer: 'A', position: '' }),
        entry({ section: 'Orders', question: 'Positioned', answer: 'A', position: '1' }),
      ),
    );
    expect(sections.map((s) => s.heading)).toEqual(['Orders', 'General']);
  });

  it('returns an empty array when no entries exist (caller falls back to static)', () => {
    expect(mapHelpQuestions(response())).toEqual([]);
  });
});
