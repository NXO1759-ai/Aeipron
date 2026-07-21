import { describe, it, expect } from 'vitest';
import {
  parseLegalHtml,
  resolveInlineActions,
  structureLegalText,
  type LegalBlock,
  type LegalInline,
} from '@/lib/legal-blocks';
import { LEGAL_DOCUMENTS } from '@/lib/legal-content';

// ---------------------------------------------------------------------------
// lib/legal-blocks — the pure parsers behind the footer's legal dialogs.
// Tested in the node Vitest env (no DOM): the footer component is a thin
// renderer over these trees (same split as lib/rich-text + RichText).
//
//   parseLegalHtml        — the Shopify editor HTML subset (refund / terms)
//   structureLegalText    — plain text → meta / headings / lists (privacy)
//   resolveInlineActions  — the terms' "[LINK]" placeholders → dialog actions
//
// The real document bodies from lib/legal-content are exercised end-to-end
// here, so a content edit that breaks the parsers fails loudly.
// ---------------------------------------------------------------------------

/** Flatten every text/link/action leaf in a block tree (assertion helper). */
function flatten(blocks: LegalBlock[]): LegalInline[] {
  const out: LegalInline[] = [];
  const walk = (run: LegalInline) => {
    out.push(run);
    if (run.kind === 'link') run.children.forEach(walk);
  };
  for (const block of blocks) {
    if (block.kind === 'paragraph') block.children.forEach(walk);
    if (block.kind === 'list') block.items.flat().forEach(walk);
  }
  return out;
}

function textValues(blocks: LegalBlock[]): string {
  return flatten(blocks)
    .map((run) => (run.kind === 'text' ? run.value : run.kind === 'action' ? run.label : ''))
    .join('');
}

describe('parseLegalHtml — Shopify editor subset', () => {
  it('returns an empty tree for empty / blank input', () => {
    expect(parseLegalHtml('')).toEqual([]);
    expect(parseLegalHtml('   ')).toEqual([]);
  });

  it('parses paragraphs, bold runs and line breaks', () => {
    const blocks = parseLegalHtml('<p>Hello <strong>world</strong> <br>second line</p>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      children: [
        { kind: 'text', value: 'Hello ' },
        { kind: 'text', value: 'world', bold: true },
        { kind: 'text', value: ' ' },
        { kind: 'break' },
        { kind: 'text', value: 'second line' },
      ],
    });
  });

  it('drops the editor\'s "<p><br></p>" spacer paragraphs', () => {
    const blocks = parseLegalHtml('<p>One</p><p><br></p><p>Two</p>');
    expect(blocks).toHaveLength(2);
    expect(textValues(blocks)).toBe('OneTwo');
  });

  it('keeps safe link protocols (mailto) with their href', () => {
    const blocks = parseLegalHtml('<p>Mail <a href="mailto:hello@wearapeiron.com">us</a>.</p>');
    const link = flatten(blocks).find((run) => run.kind === 'link');
    expect(link).toMatchObject({ kind: 'link', href: 'mailto:hello@wearapeiron.com' });
  });

  it('strips unsafe link protocols — React does not sanitize javascript: hrefs', () => {
    const blocks = parseLegalHtml('<p><a href="javascript:alert(1)">click</a></p>');
    const link = flatten(blocks).find((run) => run.kind === 'link');
    expect(link).toMatchObject({ kind: 'link', href: undefined });
  });

  it('strips unknown tags but keeps their text', () => {
    const blocks = parseLegalHtml('<p><span>kept</span> <script>alert(1)</script> text</p>');
    expect(textValues(blocks)).toContain('kept');
    expect(textValues(blocks)).not.toContain('<span>');
  });

  it('decodes the entity set (&nbsp;, &amp;, &#39;)', () => {
    const blocks = parseLegalHtml('<p>a&nbsp;b &amp; &#39;c&#39;</p>');
    expect(textValues(blocks)).toBe("a\u00A0b & 'c'");
  });

  it('keeps stray text outside <p> tags as its own paragraph', () => {
    const blocks = parseLegalHtml('lead-in<p>body</p>tail');
    expect(blocks).toHaveLength(3);
    expect(textValues(blocks)).toBe('lead-inbodytail');
  });

  it('tolerates malformed input without throwing', () => {
    expect(() => parseLegalHtml('<p>unclosed')).not.toThrow();
    expect(() => parseLegalHtml('<p>dangling <strong>bold')).not.toThrow();
    expect(() => parseLegalHtml('stray < bracket')).not.toThrow();
  });
});

describe('parseLegalHtml — the real policy bodies', () => {
  it('parses the Refund Policy: 30-day lead, mailto links, spacer-free', () => {
    const blocks = parseLegalHtml(LEGAL_DOCUMENTS.refund.body);
    expect(blocks.length).toBeGreaterThan(3);
    expect(textValues(blocks)).toContain('We have a 30-day return policy');
    const links = flatten(blocks).filter((run) => run.kind === 'link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.kind === 'link' && link.href?.startsWith('mailto:')).toBe(true);
    }
    // No raw markup survives into rendered text.
    expect(textValues(blocks)).not.toMatch(/<[^>]*>/);
  });

  it('parses the Terms of Service: 26 bold section headings survive', () => {
    const blocks = parseLegalHtml(LEGAL_DOCUMENTS.terms.body);
    const bolds = flatten(blocks).filter((run) => run.kind === 'text' && run.bold);
    const sections = bolds.filter(
      (run) => run.kind === 'text' && /^(OVERVIEW|SECTION \d+ - )/.test(run.value.trim()),
    );
    expect(sections).toHaveLength(26);
    expect(textValues(blocks)).toContain('Welcome to Apeiron!');
  });
});

describe('structureLegalText — plain-text Privacy Policy', () => {
  const headings = ['Collect', 'Sources'];

  it('detects the meta line, headings, paragraphs and lists', () => {
    const blocks = structureLegalText(
      'Last updated: July 21, 2026\n\nIntro paragraph.\n\nCollect\n\nWe collect:\n\nAlpha item.\nBeta item.\nSources\n\nDirectly.',
      headings,
    );
    expect(blocks[0]).toEqual({ kind: 'meta', value: 'Last updated: July 21, 2026' });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph' });
    expect(blocks[2]).toEqual({ kind: 'heading', value: 'Collect' });
    expect(blocks[3]).toMatchObject({ kind: 'paragraph' });
    expect(blocks[4]).toMatchObject({ kind: 'list' });
    expect(blocks[4].kind === 'list' && blocks[4].items).toHaveLength(2);
    expect(blocks[5]).toEqual({ kind: 'heading', value: 'Sources' });
    expect(blocks[6]).toMatchObject({ kind: 'paragraph' });
  });

  it('bolds a short lead-in sentence of a list item (template style)', () => {
    const [block] = structureLegalText('Legal Reasons. We use your information to comply.\nPlain item.', []);
    expect(block.kind === 'list' && block.items[0]).toEqual([
      { kind: 'text', value: 'Legal Reasons.', bold: true },
      { kind: 'text', value: ' We use your information to comply.' },
    ]);
    expect(block.kind === 'list' && block.items[1]).toEqual([{ kind: 'text', value: 'Plain item.' }]);
  });

  it('does NOT bold a long first sentence', () => {
    const long =
      'With Shopify, vendors and other third parties who perform services on our behalf (e.g. IT management, payment processing).';
    const [block] = structureLegalText(`${long}\nSecond item.`, []);
    expect(block.kind === 'list' && block.items[0]).toEqual([{ kind: 'text', value: long }]);
  });

  it('structures the real Privacy Policy: meta, 13 headings, bulleted groups', () => {
    const doc = LEGAL_DOCUMENTS.privacy;
    const blocks = structureLegalText(doc.body, doc.headings);
    expect(blocks[0]).toEqual({ kind: 'meta', value: 'Last updated: July 21, 2026' });
    expect(blocks.filter((b) => b.kind === 'heading')).toHaveLength(13);
    expect(blocks.filter((b) => b.kind === 'list').length).toBeGreaterThanOrEqual(5);
    // The disclosure item with "(e.g." must stay a single unbolded run.
    const items = blocks.flatMap((b) => (b.kind === 'list' ? b.items : []));
    const eg = items.find((item) =>
      item.some((run) => run.kind === 'text' && run.value.includes('(e.g.')),
    );
    expect(eg).toHaveLength(1);
  });
});

describe('resolveInlineActions — the terms\' "[LINK]" placeholders', () => {
  it('resolves markers in order; label comes from the preceding words', () => {
    const blocks: LegalBlock[] = [
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', value: '…bound by these Terms of Service and our Privacy Policy [LINK]. If you…' },
          { kind: 'text', value: '…accordance with our Refund Policy [LINK].  You…' },
        ],
      },
    ];
    const out = resolveInlineActions(blocks, [
      { take: 'Privacy Policy ', opens: 'privacy' },
      { take: 'Refund Policy ', opens: 'refund' },
    ]);
    expect(out[0]).toEqual({
      kind: 'paragraph',
      children: [
        { kind: 'text', value: '…bound by these Terms of Service and our ' },
        { kind: 'action', label: 'Privacy Policy', opens: 'privacy' },
        { kind: 'text', value: '. If you…' },
        { kind: 'text', value: '…accordance with our ' },
        { kind: 'action', label: 'Refund Policy', opens: 'refund' },
        { kind: 'text', value: '.  You…' },
      ],
    });
  });

  it('leaves leftover markers and unused specs untouched', () => {
    const blocks: LegalBlock[] = [
      { kind: 'paragraph', children: [{ kind: 'text', value: 'a [LINK] b [LINK] c' }] },
    ];
    const out = resolveInlineActions(blocks, [{ take: '', opens: 'privacy' }]);
    const text = textValues(out);
    expect(text).toContain('[LINK]'); // the second marker stays as plain text
    expect(text).toContain('Learn more'); // empty take falls back to a label
  });

  it('resolves all four real terms placeholders — none remain', () => {
    const doc = LEGAL_DOCUMENTS.terms;
    const blocks = resolveInlineActions(parseLegalHtml(doc.body), doc.inlineActions ?? []);
    expect(textValues(blocks)).not.toContain('[LINK]');
    const actions = flatten(blocks).filter((run) => run.kind === 'action');
    expect(actions.map((run) => (run.kind === 'action' ? run.opens : ''))).toEqual([
      'privacy',
      'refund',
      'privacy',
      'privacy',
    ]);
    expect(actions.map((run) => (run.kind === 'action' ? run.label : ''))).toEqual([
      'Privacy Policy',
      'Refund Policy',
      'here',
      'privacy policy',
    ]);
    // The sentences still read exactly as written around the actions.
    expect(textValues(blocks)).toContain('Terms of Service and our Privacy Policy. If you do not agree');
    expect(textValues(blocks)).toContain('in accordance with our Refund Policy.');
  });
});
