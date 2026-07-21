import { describe, it, expect } from 'vitest';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '@/lib/legal-content';

// ---------------------------------------------------------------------------
// lib/legal-content — data-integrity contract for the three footer policies.
//
// The documents are merchant-provided and verbatim; these tests guard the
// shape the dialogs rely on and pin the placeholders that are PENDING
// MERCHANT INPUT so they can't be silently edited away (or "fixed" with
// invented values) without a deliberate test update.
// ---------------------------------------------------------------------------

const IDS: LegalDocumentId[] = ['privacy', 'refund', 'terms'];

describe('lib/legal-content', () => {
  it('exposes exactly the three footer documents with titles and formats', () => {
    expect(Object.keys(LEGAL_DOCUMENTS).sort()).toEqual([...IDS].sort());
    expect(LEGAL_DOCUMENTS.privacy).toMatchObject({ title: 'Privacy Policy', format: 'text' });
    expect(LEGAL_DOCUMENTS.refund).toMatchObject({ title: 'Refund Policy', format: 'html' });
    expect(LEGAL_DOCUMENTS.terms).toMatchObject({ title: 'Terms of Service', format: 'html' });
  });

  it('every document has a non-empty body', () => {
    for (const id of IDS) {
      expect(LEGAL_DOCUMENTS[id].body.length).toBeGreaterThan(500);
    }
  });

  it('privacy headings all appear as standalone lines in the body', () => {
    const { body, headings } = LEGAL_DOCUMENTS.privacy;
    expect(headings && headings.length).toBeGreaterThan(0);
    const lines = new Set(body.split('\n').map((line) => line.trim()));
    for (const heading of headings ?? []) {
      expect(lines.has(heading)).toBe(true);
    }
    expect(body.startsWith('Last updated:')).toBe(true);
  });

  it('pins the pending-merchant-input placeholders (left verbatim on purpose)', () => {
    // The returns address is still to be decided — never invented.
    expect(LEGAL_DOCUMENTS.refund.body).toContain('[TBD]');
    // The privacy opt-out link is unlinked in the source text.
    expect(LEGAL_DOCUMENTS.privacy.body).toContain('Shopify Privacy Portal Link');
  });

  it('keeps the terms merchant note in the verbatim source, redacted at render', () => {
    const { body, redactions } = LEGAL_DOCUMENTS.terms;
    // The source body stays verbatim…
    expect(body).toContain('[NOTE TO MERCHANT:');
    // …and exactly that instruction line is configured for render-time removal.
    expect(redactions).toHaveLength(1);
    for (const needle of redactions ?? []) {
      expect(body).toContain(needle);
    }
  });

  it('terms ships exactly four "[LINK]" placeholders with matching inlineActions', () => {
    const { body, inlineActions } = LEGAL_DOCUMENTS.terms;
    const occurrences = body.split('[LINK]').length - 1;
    expect(occurrences).toBe(4);
    expect(inlineActions).toHaveLength(4);
    // Every action targets a real document.
    for (const action of inlineActions ?? []) {
      expect(IDS).toContain(action.opens);
    }
  });

  it('html bodies use only the parser-supported tag subset', () => {
    for (const id of ['refund', 'terms'] as const) {
      const tags = new Set(
        [...LEGAL_DOCUMENTS[id].body.matchAll(/<\/?\s*([a-zA-Z0-9]+)/g)].map((m) =>
          m[1].toLowerCase(),
        ),
      );
      expect([...tags].sort()).toEqual(['a', 'br', 'p', 'strong']);
    }
  });
});
