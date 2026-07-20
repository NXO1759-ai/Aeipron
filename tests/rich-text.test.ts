import { describe, it, expect } from 'vitest';
import { buildRichTextTree } from '@/lib/rich-text';

// ---------------------------------------------------------------------------
// buildRichTextTree — pure parser that maps a Shopify `rich_text` metafield
// value (a JSON STRING of typed nodes) to a normalized, serializable block
// tree. Tested in the node Vitest env (no DOM) because it is framework-agnostic
// — the <RichText> React component is a thin renderer over this tree.
//
// Cases:
//   - empty / null / undefined        → null (caller omits the section)
//   - invalid JSON (plain text value) → one <p> block holding the raw string
//   - paragraph / heading / list (ordered + unordered) / list-item with
//     paragraph-wrapped text / link (url+target+rel) / inline formatting flags
//     (bold / italic / underline / strikethrough / code)
//   - unknown node types              → children preserved, not dropped
//   - URL sanitization                → unsafe protocols stripped (XSS guard)
// ---------------------------------------------------------------------------

describe('buildRichTextTree — absence', () => {
  it('returns null for undefined', () => {
    expect(buildRichTextTree(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(buildRichTextTree(null)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(buildRichTextTree('')).toBeNull();
  });
});

describe('buildRichTextTree — plain-text fallback (invalid JSON)', () => {
  it('renders raw non-JSON text as a single <p> block', () => {
    const tree = buildRichTextTree('Machine wash cold. Tumble dry low.');
    expect(tree).toEqual([
      {
        kind: 'element',
        tag: 'p',
        props: {},
        children: [{ kind: 'text', value: 'Machine wash cold. Tumble dry low.' }],
      },
    ]);
  });
});

describe('buildRichTextTree — blocks', () => {
  it('maps a paragraph with plain text', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Hello' }] }],
    });
    expect(buildRichTextTree(value)).toEqual([
      { kind: 'element', tag: 'p', props: {}, children: [{ kind: 'text', value: 'Hello' }] },
    ]);
  });

  it('maps a heading at level 2 by default and clamps the level to 1–6', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [
        { type: 'heading', level: 1, children: [{ type: 'text', value: 'Title' }] },
        { type: 'heading', level: 99, children: [{ type: 'text', value: 'Clamped' }] },
      ],
    });
    expect(buildRichTextTree(value)).toEqual([
      { kind: 'element', tag: 'h1', props: {}, children: [{ kind: 'text', value: 'Title' }] },
      { kind: 'element', tag: 'h6', props: {}, children: [{ kind: 'text', value: 'Clamped' }] },
    ]);
  });

  it('maps an unordered list', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [
        {
          type: 'list',
          listType: 'unordered',
          children: [
            { type: 'list-item', children: [{ type: 'text', value: 'One' }] },
            { type: 'list-item', children: [{ type: 'text', value: 'Two' }] },
          ],
        },
      ],
    });
    expect(buildRichTextTree(value)).toEqual([
      {
        kind: 'element',
        tag: 'ul',
        props: {},
        children: [
          { kind: 'element', tag: 'li', props: {}, children: [{ kind: 'text', value: 'One' }] },
          { kind: 'element', tag: 'li', props: {}, children: [{ kind: 'text', value: 'Two' }] },
        ],
      },
    ]);
  });

  it('maps an ordered list (listType: "ordered")', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [
        {
          type: 'list',
          listType: 'ordered',
          children: [{ type: 'list-item', children: [{ type: 'text', value: 'A' }] }],
        },
      ],
    });
    expect(buildRichTextTree(value)).toEqual([
      { kind: 'element', tag: 'ol', props: {}, children: [{ kind: 'element', tag: 'li', props: {}, children: [{ kind: 'text', value: 'A' }] }] },
    ]);
  });

  it('unwraps paragraph-wrapped text inside list-items (no nested <p> in <li>)', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [
        {
          type: 'list',
          listType: 'unordered',
          children: [{ type: 'list-item', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'One' }] }] }],
        },
      ],
    });
    const tree = buildRichTextTree(value)!;
    const ul = tree[0] as Extract<typeof tree[0], { kind: 'element' }>;
    const li = ul.children[0] as Extract<typeof ul.children[0], { kind: 'element' }>;
    expect(li.tag).toBe('li');
    // The <li> contains the text directly, NOT a nested <p> element.
    expect(li.children).toEqual([{ kind: 'text', value: 'One' }]);
    expect(li.children.some((c) => c.kind === 'element' && c.tag === 'p')).toBe(false);
  });
});

describe('buildRichTextTree — inline formatting + links', () => {
  it('carries inline formatting flags (bold / italic / underline / strike / code)', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'bold', bold: true },
            { type: 'text', value: 'italic', italic: true },
            { type: 'text', value: 'code', code: true },
          ],
        },
      ],
    });
    const tree = buildRichTextTree(value)!;
    const texts = (tree[0] as Extract<typeof tree[0], { kind: 'element' }>).children;
    expect(texts).toEqual([
      { kind: 'text', value: 'bold', bold: true },
      { kind: 'text', value: 'italic', italic: true },
      { kind: 'text', value: 'code', code: true },
    ]);
  });

  it('maps a link with url + default safe target/rel', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'link', url: 'https://example.com', children: [{ type: 'text', value: 'link text' }] }],
        },
      ],
    });
    const tree = buildRichTextTree(value)!;
    const p = tree[0] as Extract<typeof tree[0], { kind: 'element' }>;
    expect(p.children).toEqual([
      {
        kind: 'element',
        tag: 'a',
        props: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer' },
        children: [{ kind: 'text', value: 'link text' }],
      },
    ]);
  });

  it('preserves an explicit link target/rel when provided', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url: 'https://example.com',
              target: '_self',
              rel: 'noopener',
              children: [{ type: 'text', value: 'x' }],
            },
          ],
        },
      ],
    });
    const tree = buildRichTextTree(value)!;
    const p = tree[0] as Extract<typeof tree[0], { kind: 'element' }>;
    expect((p.children[0] as Extract<typeof p.children[0], { kind: 'element' }>).props).toEqual({
      href: 'https://example.com',
      target: '_self',
      rel: 'noopener',
    });
  });
});

describe('buildRichTextTree — robustness', () => {
  it('returns an empty array for a root with no children', () => {
    const value = JSON.stringify({ type: 'root', children: [] });
    expect(buildRichTextTree(value)).toEqual([]);
  });

  it('does not throw on an unknown block type and preserves its children', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [
        {
          type: 'future-block-type',
          children: [{ type: 'text', value: 'kept' }],
        },
      ],
    });
    const tree = buildRichTextTree(value)!;
    // Unknown wrapper with children → a <p> block containing the inline text.
    expect(tree).toEqual([
      { kind: 'element', tag: 'p', props: {}, children: [{ kind: 'text', value: 'kept' }] },
    ]);
  });
});

describe('buildRichTextTree — URL sanitization (XSS hardening)', () => {
  /** Build a rich-text value wrapping a single paragraph of inline children. */
  function doc(children: unknown[]): string {
    return JSON.stringify({ type: 'root', children: [{ type: 'paragraph', children }] });
  }

  it('strips the href from a javascript: link (renders an inert anchor)', () => {
    const tree = buildRichTextTree(
      doc([{ type: 'link', url: 'javascript:alert(document.cookie)', children: [{ type: 'text', value: 'click' }] }]),
    )!;
    const link = (tree[0] as Extract<typeof tree[0], { kind: 'element' }>).children[0] as Extract<
      typeof tree[0],
      { kind: 'element' }
    >;
    expect(link.tag).toBe('a');
    expect(link.props.href).toBeUndefined();
    expect(link.props.target).toBeUndefined();
    // The link TEXT is preserved — only the navigation is removed.
    expect(link.children).toEqual([{ kind: 'text', value: 'click' }]);
  });

  it('strips data: and vbscript: link urls', () => {
    for (const url of ['data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)']) {
      const tree = buildRichTextTree(
        doc([{ type: 'link', url, children: [{ type: 'text', value: 'x' }] }]),
      )!;
      const link = (tree[0] as Extract<typeof tree[0], { kind: 'element' }>).children[0] as Extract<
        typeof tree[0],
        { kind: 'element' }
      >;
      expect(link.props.href).toBeUndefined();
    }
  });

  it('strips a javascript: url disguised with leading whitespace / mixed case', () => {
    const tree = buildRichTextTree(
      doc([{ type: 'link', url: '  JaVaScRiPt:alert(1)', children: [{ type: 'text', value: 'x' }] }]),
    )!;
    const link = (tree[0] as Extract<typeof tree[0], { kind: 'element' }>).children[0] as Extract<
      typeof tree[0],
      { kind: 'element' }
    >;
    expect(link.props.href).toBeUndefined();
  });

  it('keeps https / http / mailto / tel and relative link urls', () => {
    for (const url of ['https://example.com/a', 'http://example.com', 'mailto:hi@example.com', 'tel:+12125550123', '/pages/faq']) {
      const tree = buildRichTextTree(
        doc([{ type: 'link', url, children: [{ type: 'text', value: 'x' }] }]),
      )!;
      const link = (tree[0] as Extract<typeof tree[0], { kind: 'element' }>).children[0] as Extract<
        typeof tree[0],
        { kind: 'element' }
      >;
      expect(link.props.href).toBe(url);
    }
  });

  it('forces noopener noreferrer on _blank even when the metafield sets a custom rel', () => {
    const tree = buildRichTextTree(
      doc([
        {
          type: 'link',
          url: 'https://example.com',
          target: '_blank',
          rel: 'opener',
          children: [{ type: 'text', value: 'x' }],
        },
      ]),
    )!;
    const link = (tree[0] as Extract<typeof tree[0], { kind: 'element' }>).children[0] as Extract<
      typeof tree[0],
      { kind: 'element' }
    >;
    expect(link.props.rel).toBe('noopener noreferrer');
  });

  it('drops an image whose url is not https', () => {
    for (const url of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'http://example.com/x.png']) {
      const value = JSON.stringify({ type: 'root', children: [{ type: 'image', url }] });
      expect(buildRichTextTree(value)).toEqual([]);
    }
  });

  it('keeps an https image url', () => {
    const value = JSON.stringify({
      type: 'root',
      children: [{ type: 'image', url: 'https://cdn.shopify.com/x.png' }],
    });
    expect(buildRichTextTree(value)).toEqual([
      { kind: 'element', tag: 'img', props: { src: 'https://cdn.shopify.com/x.png' }, children: [] },
    ]);
  });
});
