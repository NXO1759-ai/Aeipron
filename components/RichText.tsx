import { Fragment, type ReactNode, type Key, type JSX } from 'react';
import { buildRichTextTree, type RichTextBlock } from '@/lib/rich-text';

// ---------------------------------------------------------------------------
// RichText — renders a Shopify `rich_text` metafield value to React nodes.
//
// The parsing + normalization (Shopify JSON tree → framework-agnostic block
// tree) lives in lib/rich-text.ts (`buildRichTextTree`), tested in the node
// Vitest env. This file is the thin React renderer over that tree.
//
// Rendering to React nodes (NOT dangerouslySetInnerHTML) means we never inject
// raw HTML — only the element types we explicitly handle are emitted, so there
// is nothing to sanitize and no extra dependency. An empty/absent value yields
// null (the caller omits the section); a non-JSON value becomes a single <p>
// of the raw string (handled in buildRichTextTree).
// ---------------------------------------------------------------------------

/** Render a normalized text block, wrapping it in the formatting elements its
 * flags request (innermost-first so nesting order is stable). */
function renderText(block: Extract<RichTextBlock, { kind: 'text' }>, key: Key): ReactNode {
  let el: ReactNode = block.value;
  if (block.code) el = <code>{el}</code>;
  if (block.strikethrough) el = <s>{el}</s>;
  if (block.underline) el = <u>{el}</u>;
  if (block.italic) el = <em>{el}</em>;
  if (block.bold) el = <strong>{el}</strong>;
  return <Fragment key={key}>{el}</Fragment>;
}

/** Render a normalized block (text or element) to React nodes. */
function renderBlock(block: RichTextBlock, key: Key): ReactNode {
  if (block.kind === 'text') return renderText(block, key);

  if (block.tag === 'img') {
    return <img key={key} src={block.props.src} alt="" className="my-2" />;
  }

  if (block.tag === 'a') {
    return (
      <a
        key={key}
        href={block.props.href}
        target={block.props.target}
        rel={block.props.rel}
        className="underline underline-offset-2 hover:text-primary-cream transition-colors"
      >
        {block.children.map((c, i) => renderBlock(c, i))}
      </a>
    );
  }

  if (block.tag === 'ul') {
    return (
      <ul key={key} className="list-disc pl-5 space-y-1">
        {block.children.map((c, i) => renderBlock(c, i))}
      </ul>
    );
  }

  if (block.tag === 'ol') {
    return (
      <ol key={key} className="list-decimal pl-5 space-y-1">
        {block.children.map((c, i) => renderBlock(c, i))}
      </ol>
    );
  }

  if (block.tag.startsWith('h')) {
    const Tag = block.tag as keyof JSX.IntrinsicElements;
    return (
      <Tag key={key} className="font-bold mt-3 first:mt-0">
        {block.children.map((c, i) => renderBlock(c, i))}
      </Tag>
    );
  }

  // p, li
  const Tag = block.tag as keyof JSX.IntrinsicElements;
  return (
    <Tag key={key} className="leading-relaxed">
      {block.children.map((c, i) => renderBlock(c, i))}
    </Tag>
  );
}

/**
 * Render a Shopify `rich_text` metafield value to React nodes. Returns null
 * for an empty/absent value so the caller can omit the section.
 */
export function RichText({ value, className }: { value?: string | null; className?: string }): ReactNode {
  const tree = buildRichTextTree(value);
  if (!tree) return null;
  return <div className={className}>{tree.map((block, i) => renderBlock(block, i))}</div>;
}