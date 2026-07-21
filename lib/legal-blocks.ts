// ---------------------------------------------------------------------------
// lib/legal-blocks — pure parsers that turn the legal documents in
// lib/legal-content into a normalized block tree for the footer dialogs.
//
// Two input formats (see legal-content.ts):
//   html  — the Shopify editor subset (<p> / <br> / <strong> / <b> / <a>);
//           parseLegalHtml walks it with a whitelist state machine. Only
//           those tags are honored, every other tag is stripped (its text
//           kept), link hrefs are protocol-sanitized, and the small entity
//           set is decoded — so the dialog renders safe React nodes and never
//           touches dangerouslySetInnerHTML (same posture as lib/rich-text).
//   text  — plain text (the Privacy Policy); structureLegalText restores
//           the template's structure: a "Last updated:" meta line, the known
//           section headings, paragraphs, and bullet lists (consecutive-line
//           runs), re-bolding the lead-in of list items ("Right to Delete."
//           style) the way the original Shopify template does.
//
// resolveInlineActions converts the Terms' "[LINK]" placeholders into
// `action` inline nodes (in-dialog navigation), in document order.
// redactBlocks strips verbatim source lines (e.g. the Terms' "[NOTE TO
// MERCHANT: …]" instruction) from the rendered tree.
//
// No React, no server-only imports — unit-tested in the node Vitest env
// (tests/legal-blocks.test.ts). Never throws on malformed input: worst case
// is a stripped-down but readable document.
// ---------------------------------------------------------------------------

/** Inline content of a legal block. */
export type LegalInline =
  | { kind: 'text'; value: string; bold?: boolean }
  // href undefined = unsafe protocol stripped → renders as inert text.
  | { kind: 'link'; href?: string; children: LegalInline[] }
  | { kind: 'break' }
  // A "[LINK]" placeholder resolved to in-dialog navigation (terms only).
  | { kind: 'action'; label: string; opens: string };

/** A block of a legal document. */
export type LegalBlock =
  // The "Last updated: …" line (privacy).
  | { kind: 'meta'; value: string }
  | { kind: 'heading'; value: string }
  | { kind: 'paragraph'; children: LegalInline[] }
  | { kind: 'list'; items: LegalInline[][] };

/** One "[LINK]" resolution: `take` is the text immediately before the
 * placeholder — it leaves the static run and becomes the action's label. */
export interface LegalInlineActionSpec {
  take: string;
  opens: string;
}

// ---------------------------------------------------------------------------
// HTML subset parser
// ---------------------------------------------------------------------------

/** Protocols allowed in policy links — same set as lib/rich-text. React does
 * NOT sanitize `javascript:` hrefs; anything outside this set is dropped. */
const SAFE_LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

function sanitizeHref(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed, 'https://localhost');
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** Decode the small entity set the Shopify editor emits. `&amp;` runs LAST so
 * an already-encoded sequence (e.g. "&amp;nbsp;") is never double-decoded. */
const ENTITIES: readonly [RegExp, string][] = [
  [/&nbsp;/gi, '\u00A0'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#0?39;|&apos;/gi, "'"],
  [/&amp;/gi, '&'],
];

function decodeEntities(value: string): string {
  let out = value;
  for (const [pattern, replacement] of ENTITIES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Parse the inline content of one <p> fragment into inline runs. */
function parseInline(fragment: string): LegalInline[] {
  const out: LegalInline[] = [];
  let bold = false;
  let link: Extract<LegalInline, { kind: 'link' }> | null = null;

  const pushText = (raw: string) => {
    const value = decodeEntities(raw);
    if (!value) return;
    const run: LegalInline = bold
      ? { kind: 'text', value, bold: true }
      : { kind: 'text', value };
    if (link) link.children.push(run);
    else out.push(run);
  };

  let i = 0;
  while (i < fragment.length) {
    if (fragment[i] === '<') {
      const gt = fragment.indexOf('>', i);
      if (gt === -1) {
        // Malformed trailing '<' — drop the angle, keep the rest as text.
        pushText(fragment.slice(i + 1));
        break;
      }
      const raw = fragment.slice(i + 1, gt);
      const closing = /^\s*\//.test(raw);
      const name = (raw.match(/^\/?\s*([a-zA-Z0-9]+)/)?.[1] ?? '').toLowerCase();

      if (name === 'br') {
        // Breaks live at block level; inside a link (not present in these
        // documents) they are ignored to keep links single-line.
        if (!link) out.push({ kind: 'break' });
      } else if (name === 'strong' || name === 'b') {
        bold = !closing;
      } else if (name === 'a') {
        if (closing) {
          if (link) {
            out.push(link);
            link = null;
          }
        } else if (!link) {
          const hrefMatch = raw.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
          const href = sanitizeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '');
          link = { kind: 'link', href, children: [] };
        }
      }
      // Every other tag (whitelisted-away or unknown) is stripped; its text
      // content flows through on the next iterations.
      i = gt + 1;
    } else {
      const next = fragment.indexOf('<', i);
      pushText(fragment.slice(i, next === -1 ? undefined : next));
      i = next === -1 ? fragment.length : next;
    }
  }
  if (link) out.push(link); // unclosed <a>: keep the collected children

  // A fragment holding only breaks / whitespace (the editor's "<p><br></p>"
  // spacers) yields no runs — spacing comes from CSS paragraph rhythm.
  const hasContent = out.some(
    (run) => run.kind === 'link' || run.kind === 'action' || (run.kind === 'text' && run.value.trim()),
  );
  return hasContent ? out : [];
}

/**
 * Parse a Shopify-editor HTML document (the <p>/<br>/<strong>/<a> subset)
 * into paragraph blocks. Stray text outside <p> tags is kept as its own
 * paragraph; empty input yields an empty tree.
 */
export function parseLegalHtml(html: string): LegalBlock[] {
  if (!html || !html.trim()) return [];
  const blocks: LegalBlock[] = [];
  const paragraphRe = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let consumed = 0;
  let match: RegExpExecArray | null;

  const pushStray = (raw: string) => {
    const text = raw.replace(/<[^>]*>/g, '').trim();
    if (text) blocks.push({ kind: 'paragraph', children: [{ kind: 'text', value: decodeEntities(text) }] });
  };

  while ((match = paragraphRe.exec(html))) {
    pushStray(html.slice(consumed, match.index));
    const children = parseInline(match[1]);
    if (children.length) blocks.push({ kind: 'paragraph', children });
    consumed = match.index + match[0].length;
  }
  pushStray(html.slice(consumed));
  return blocks;
}

// ---------------------------------------------------------------------------
// Plain-text structurer (Privacy Policy)
// ---------------------------------------------------------------------------

/** Max length of a list item's bold lead-in ("Managing Communication Preferences."). */
const LEAD_MAX = 65;

/** Split a list item into a bold lead sentence + the remainder, the way the
 * Shopify template styles it. Items whose first sentence is long (or absent)
 * stay a single plain run. */
function splitLead(item: string): LegalInline[] {
  const idx = item.indexOf('. ');
  if (idx > 0 && idx + 1 <= LEAD_MAX) {
    return [
      { kind: 'text', value: item.slice(0, idx + 1), bold: true },
      { kind: 'text', value: item.slice(idx + 1) },
    ];
  }
  return [{ kind: 'text', value: item }];
}

/**
 * Structure the plain-text Privacy Policy: first line becomes the meta line
 * when it is "Last updated: …"; lines matching `headings` become heading
 * blocks; a run of consecutive non-heading lines becomes a bullet list (the
 * template's <ul>s lost their markup in the plain-text export), a single
 * line becomes a paragraph.
 */
export function structureLegalText(text: string, headings: readonly string[] = []): LegalBlock[] {
  const headingSet = new Set(headings);
  const blocks: LegalBlock[] = [];
  let buffer: string[] = [];
  let metaConsumed = false;

  const flush = () => {
    if (buffer.length === 1) {
      blocks.push({ kind: 'paragraph', children: [{ kind: 'text', value: buffer[0] }] });
    } else if (buffer.length > 1) {
      blocks.push({ kind: 'list', items: buffer.map(splitLead) });
    }
    buffer = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (!metaConsumed) {
      metaConsumed = true;
      if (/^last updated:/i.test(line)) {
        blocks.push({ kind: 'meta', value: line });
        continue;
      }
    }
    if (headingSet.has(line)) {
      flush();
      blocks.push({ kind: 'heading', value: line });
      continue;
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Render-time redaction (e.g. the Terms' "[NOTE TO MERCHANT: …]" instruction)
// ---------------------------------------------------------------------------

/**
 * Remove verbatim substrings from the rendered tree while the source `body`
 * stays untouched. Text runs emptied by a redaction are dropped, runs of
 * `<br>`s collapse to one, and paragraphs left with no content disappear —
 * so a redacted line never leaves a hole in the layout.
 */
export function redactBlocks(blocks: LegalBlock[], needles: readonly string[]): LegalBlock[] {
  const terms = needles.filter((needle) => needle.length > 0);
  if (!terms.length) return blocks;

  const redactRun = (run: LegalInline): LegalInline | null => {
    if (run.kind === 'text') {
      let value = run.value;
      for (const needle of terms) value = value.split(needle).join('');
      return value.trim() ? { ...run, value } : null;
    }
    if (run.kind === 'link') {
      const children = run.children
        .map(redactRun)
        .filter((child): child is LegalInline => child !== null);
      return children.length ? { ...run, children } : null;
    }
    return run; // breaks and actions pass through
  };

  const redactChildren = (children: LegalInline[]): LegalInline[] => {
    const out: LegalInline[] = [];
    for (const run of children) {
      const redacted = redactRun(run);
      if (redacted === null) continue;
      if (redacted.kind === 'break' && (out.length === 0 || out[out.length - 1].kind === 'break')) {
        continue; // no leading or doubled breaks
      }
      out.push(redacted);
    }
    while (out.length > 0 && out[out.length - 1].kind === 'break') out.pop();
    return out;
  };

  return blocks
    .map((block) => {
      if (block.kind === 'paragraph') {
        return { ...block, children: redactChildren(block.children) };
      }
      if (block.kind === 'list') {
        return {
          ...block,
          items: block.items.map(redactChildren).filter((item) => item.length > 0),
        };
      }
      return block;
    })
    .filter((block) => block.kind !== 'paragraph' || block.children.length > 0);
}

// ---------------------------------------------------------------------------
// "[LINK]" placeholder resolution (Terms of Service)
// ---------------------------------------------------------------------------

/**
 * Replace "[LINK]" placeholders with `action` inline nodes, consuming `specs`
 * in document order. Each spec's `take` is stripped from the end of the text
 * before the placeholder and becomes the action's label, so the rendered
 * sentence reads exactly as written ("…our Privacy Policy. If you…"). Extra
 * placeholders (or extra specs) are left untouched — content is never lost.
 */
export function resolveInlineActions(
  blocks: LegalBlock[],
  specs: readonly LegalInlineActionSpec[],
  marker = '[LINK]',
): LegalBlock[] {
  if (!specs.length) return blocks;
  const queue = [...specs];

  const mapRun = (run: LegalInline): LegalInline[] => {
    if (!queue.length || run.kind !== 'text' || !run.value.includes(marker)) return [run];
    const spec = queue.shift();
    if (!spec) return [run];
    const idx = run.value.indexOf(marker);
    let before = run.value.slice(0, idx);
    const after = run.value.slice(idx + marker.length);
    if (spec.take && before.endsWith(spec.take)) {
      before = before.slice(0, -spec.take.length);
    }
    const out: LegalInline[] = [];
    if (before) out.push({ ...run, value: before });
    out.push({ kind: 'action', label: spec.take.trimEnd() || 'Learn more', opens: spec.opens });
    if (after) out.push({ ...run, value: after });
    return out;
  };

  return blocks.map((block) => {
    if (block.kind === 'paragraph') {
      return { ...block, children: block.children.flatMap(mapRun) };
    }
    if (block.kind === 'list') {
      return { ...block, items: block.items.map((item) => item.flatMap(mapRun)) };
    }
    return block;
  });
}
