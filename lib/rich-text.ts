// ---------------------------------------------------------------------------
// Pure parser for Shopify `rich_text` metafield values.
//
// The Storefront API returns a `rich_text` metafield `value` as a JSON STRING
// — a tree of typed nodes (root / paragraph / heading / list / list-item /
// text / link / image) — NOT HTML. (Shopify docs: the `value` is "always
// stored as a string" and `type` tells you how to interpret it.)
//
// This module maps that JSON to a normalized, serializable, framework-agnostic
// block tree (`buildRichTextTree`). It contains NO React / JSX so it can be
// unit-tested in the node Vitest environment and imported anywhere. The
// React rendering of the tree lives in components/RichText.tsx.
//
// Defensive: a non-JSON value (an admin typed plain text, or the metafield
// type was changed) falls back to a single `<p>` block holding the raw string,
// so a section still shows content instead of crashing or vanishing. An
// empty / null / undefined value returns null — the caller omits the section.
// ---------------------------------------------------------------------------

/** A Shopify rich-text node (fields vary by `type`). */
export interface RichTextNode {
  type: string;
  level?: number;
  listType?: string; // "ordered" | "unordered"
  url?: string;
  target?: string;
  rel?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  value?: string;
  children?: RichTextNode[];
}

/**
 * Normalized, serializable rich-text tree. `text` nodes carry optional inline
 * formatting flags; `element` nodes carry a tag + props + children. The `kind`
 * discriminator lets a renderer switch without parsing strings.
 */
export type RichTextBlock =
  | {
      kind: 'text';
      value: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      code?: boolean;
    }
  | {
      kind: 'element';
      tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'ul' | 'ol' | 'li' | 'a' | 'img';
      props: { href?: string; target?: string; rel?: string; src?: string };
      children: RichTextBlock[];
    };

/** Map a Shopify inline node (text / link) to a normalized inline block. */
function toInline(child: RichTextNode): RichTextBlock {
  if (child.type === 'link') {
    return {
      kind: 'element',
      tag: 'a',
      props: {
        href: child.url,
        target: child.target ?? '_blank',
        rel: child.rel ?? 'noopener noreferrer',
      },
      children: (child.children ?? []).map(toInline),
    };
  }
  // `text` (and any unknown inline) → text block with its formatting flags.
  return {
    kind: 'text',
    value: child.value ?? '',
    bold: child.bold,
    italic: child.italic,
    underline: child.underline,
    strikethrough: child.strikethrough,
    code: child.code,
  };
}

/**
 * Map a Shopify block's inline children to normalized inline blocks. Rich-text
 * list-items can contain either `text` nodes directly or `paragraph` wrappers;
 * we unwrap paragraphs so their text renders inline (no nested <p> inside <li>).
 */
function toInlineChildren(children: RichTextNode[] | undefined): RichTextBlock[] {
  if (!children) return [];
  const out: RichTextBlock[] = [];
  for (const child of children) {
    if (child.type === 'paragraph') {
      out.push(...toInlineChildren(child.children));
    } else {
      out.push(toInline(child));
    }
  }
  return out;
}

/** Map a single Shopify block node to a normalized block (or null to omit). */
function toBlock(node: RichTextNode): RichTextBlock | null {
  switch (node.type) {
    case 'paragraph':
      return { kind: 'element', tag: 'p', props: {}, children: toInlineChildren(node.children) };

    case 'heading': {
      const level = Math.min(Math.max(node.level ?? 2, 1), 6);
      return {
        kind: 'element',
        tag: `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
        props: {},
        children: toInlineChildren(node.children),
      };
    }

    case 'list':
      return {
        kind: 'element',
        tag: node.listType === 'ordered' ? 'ol' : 'ul',
        props: {},
        children: (node.children ?? []).map((li) => ({
          kind: 'element' as const,
          tag: 'li' as const,
          props: {},
          children: toInlineChildren(li.children),
        })),
      };

    case 'image':
      return { kind: 'element', tag: 'img', props: { src: node.url }, children: [] };

    case 'link':
    case 'text':
      // An inline node surfacing at block level → render inline within root.
      return toInline(node);

    default:
      // Unknown wrapper: preserve its children (don't drop content). Unknown
      // leaf with no children: nothing to render.
      return node.children
        ? { kind: 'element', tag: 'p', props: {}, children: toInlineChildren(node.children) }
        : null;
  }
}

/**
 * Parse a Shopify `rich_text` metafield value (JSON string) into a normalized,
 * serializable block tree (the root node's children). Returns null for an
 * empty/absent value so the caller can omit the section. Falls back to a
 * single `<p>` block holding the raw string when the value isn't JSON.
 */
export function buildRichTextTree(value?: string | null): RichTextBlock[] | null {
  if (!value) return null;

  let tree: RichTextNode;
  try {
    tree = JSON.parse(value);
  } catch {
    return [{ kind: 'element', tag: 'p', props: {}, children: [{ kind: 'text', value }]}];
  }

  const out: RichTextBlock[] = [];
  for (const child of tree.children ?? []) {
    const block = toBlock(child);
    if (block) out.push(block);
  }
  return out;
}