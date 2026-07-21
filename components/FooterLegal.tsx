'use client';

// ---------------------------------------------------------------------------
// FooterLegal — the footer's legal links: Privacy Policy, Refund Policy and
// Terms of Service, each opening a pop-up dialog (no routes — the store is
// headless and Shopify-hosted pages are unavailable on the current plan).
//
//   · Dialog chrome mirrors the PDP Reviews pop-up (ReviewsSection): bottom
//     sheet on mobile, centered panel from `sm` up, Esc closes, backdrop
//     click closes, page scroll locks while open, close button autofocused.
//   · Policy text (~40 kB) is NOT in the initial bundle: the content module
//     (lib/legal-content) loads via dynamic import() the first time a dialog
//     opens — preloaded on pointer-enter/focus so the click feels instant.
//   · HTML policies render through parseLegalHtml (whitelist parser) — safe
//     React nodes, never dangerouslySetInnerHTML.
//   · The Terms' four "[LINK]" placeholders render as link-styled buttons
//     that switch the open dialog to the referenced policy.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseLegalHtml,
  resolveInlineActions,
  structureLegalText,
  type LegalBlock,
  type LegalInline,
} from '@/lib/legal-blocks';
import type { LegalDocument, LegalDocumentId } from '@/lib/legal-content';

/** Footer button order + labels. Mirrors LEGAL_DOCUMENTS titles (guarded by
 * tests/legal-content.test.ts) without importing the content module eagerly. */
const LEGAL_LINKS: readonly { id: LegalDocumentId; title: string }[] = [
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'refund', title: 'Refund Policy' },
  { id: 'terms', title: 'Terms of Service' },
];

function parseDocument(doc: LegalDocument): LegalBlock[] {
  const blocks =
    doc.format === 'html' ? parseLegalHtml(doc.body) : structureLegalText(doc.body, doc.headings);
  return doc.inlineActions?.length ? resolveInlineActions(blocks, doc.inlineActions) : blocks;
}

// ---------------------------------------------------------------------------
// Renderer — the legal block tree as brand-styled React nodes.
// ---------------------------------------------------------------------------

function InlineRun({
  run,
  onOpenDocument,
}: {
  run: LegalInline;
  onOpenDocument: (id: LegalDocumentId) => void;
}) {
  if (run.kind === 'break') return <br />;
  if (run.kind === 'text') {
    return run.bold ? (
      <strong className="font-bold text-primary-cream">{run.value}</strong>
    ) : (
      <>{run.value}</>
    );
  }
  if (run.kind === 'action') {
    return (
      <button
        type="button"
        onClick={() => onOpenDocument(run.opens as LegalDocumentId)}
        className="cursor-pointer underline underline-offset-2 transition-colors hover:text-primary-cream"
      >
        {run.label}
      </button>
    );
  }
  // link — an unsafe href arrives undefined and renders as inert text.
  const children = run.children.map((child, i) => (
    <InlineRun key={i} run={child} onOpenDocument={onOpenDocument} />
  ));
  if (!run.href) return <>{children}</>;
  const external = run.href.startsWith('http');
  return (
    <a
      href={run.href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="underline underline-offset-2 transition-colors hover:text-primary-cream"
    >
      {children}
    </a>
  );
}

function LegalBlockView({
  block,
  onOpenDocument,
}: {
  block: LegalBlock;
  onOpenDocument: (id: LegalDocumentId) => void;
}) {
  if (block.kind === 'meta') {
    return (
      <p className="text-xs uppercase tracking-widest text-ui-concrete">{block.value}</p>
    );
  }
  if (block.kind === 'heading') {
    return (
      <h4 className="pt-4 text-sm font-bold uppercase tracking-widest text-primary-cream first:pt-0">
        {block.value}
      </h4>
    );
  }
  if (block.kind === 'list') {
    return (
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ui-concrete">
        {block.items.map((item, i) => (
          <li key={i}>
            {item.map((run, j) => (
              <InlineRun key={j} run={run} onOpenDocument={onOpenDocument} />
            ))}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-ui-concrete">
      {block.children.map((run, i) => (
        <InlineRun key={i} run={run} onOpenDocument={onOpenDocument} />
      ))}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

function LegalDialog({
  title,
  blocks,
  onClose,
  onOpenDocument,
}: {
  title: string;
  blocks: LegalBlock[] | undefined;
  onClose: () => void;
  onOpenDocument: (id: LegalDocumentId) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Esc closes; page scroll locks while the pop-up is open (same contract
  // as the Reviews pop-up).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Switching documents (a "[LINK]" action) starts the new policy at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [title]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-apeiron-black/85 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={scrollRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto overscroll-contain border border-ui-concrete/20 bg-primary-obsidian p-6 animate-[modal-in_200ms_ease-out] md:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-primary-cream">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label={`Close ${title}`}
            className="cursor-pointer text-xl leading-none text-ui-concrete transition-colors hover:text-primary-cream"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {blocks ? (
            blocks.map((block, i) => (
              <LegalBlockView key={i} block={block} onOpenDocument={onOpenDocument} />
            ))
          ) : (
            <p className="text-sm text-ui-concrete">Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer links + dialog state
// ---------------------------------------------------------------------------

export function FooterLegal() {
  const [openId, setOpenId] = useState<LegalDocumentId | null>(null);
  const [blocks, setBlocks] = useState<Partial<Record<LegalDocumentId, LegalBlock[]>>>({});
  const loadedRef = useRef<Partial<Record<LegalDocumentId, true>>>({});

  // Loads + parses a policy once. Called on click AND on hover/focus
  // (preload), so first-open feels instant while the text stays out of the
  // initial bundle.
  const loadDocument = useCallback(async (id: LegalDocumentId) => {
    if (loadedRef.current[id]) return;
    loadedRef.current[id] = true;
    const mod = await import('@/lib/legal-content');
    const parsed = parseDocument(mod.LEGAL_DOCUMENTS[id]);
    setBlocks((prev) => ({ ...prev, [id]: parsed }));
  }, []);

  const openDocument = useCallback(
    (id: LegalDocumentId) => {
      setOpenId(id);
      void loadDocument(id);
    },
    [loadDocument],
  );

  const openLink = openId ? LEGAL_LINKS.find((link) => link.id === openId) : undefined;

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-end">
        {LEGAL_LINKS.map((link) => (
          <button
            key={link.id}
            type="button"
            aria-haspopup="dialog"
            onClick={() => openDocument(link.id)}
            onPointerEnter={() => void loadDocument(link.id)}
            onFocus={() => void loadDocument(link.id)}
            className="cursor-pointer text-ui-concrete uppercase tracking-widest text-[10px] font-bold hover:text-primary-cream transition-colors"
          >
            {link.title}
          </button>
        ))}
      </div>

      {openLink ? (
        <LegalDialog
          title={openLink.title}
          blocks={blocks[openLink.id]}
          onClose={() => setOpenId(null)}
          onOpenDocument={openDocument}
        />
      ) : null}
    </>
  );
}
