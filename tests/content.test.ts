import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// lib/content — static Help/FAQ + Contact data shape test.
//
// These functions are the static source for the /help and /contact pages. The
// test guards the contract the pages depend on (non-empty, correct field
// shapes) so the future Shopify swap can't silently break a page by returning
// the wrong shape. No server-only imports here, so no `vi.mock('server-only')`
// is needed (unlike tests/catalog-exports.test.ts).
// ---------------------------------------------------------------------------

import { getHelpContent, getContactContent } from '@/lib/content';

describe('lib/content', () => {
  describe('getHelpContent', () => {
    const sections = getHelpContent();

    it('returns a non-empty array of sections', () => {
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
    });

    it('every section has a heading and at least one Q/A item', () => {
      for (const section of sections) {
        expect(typeof section.heading).toBe('string');
        expect(section.heading.length).toBeGreaterThan(0);
        expect(Array.isArray(section.items)).toBe(true);
        expect(section.items.length).toBeGreaterThan(0);
      }
    });

    it('every Q/A item has non-empty question and answer strings', () => {
      for (const section of sections) {
        for (const item of section.items) {
          expect(typeof item.question).toBe('string');
          expect(item.question.length).toBeGreaterThan(0);
          expect(typeof item.answer).toBe('string');
          expect(item.answer.length).toBeGreaterThan(0);
        }
      }
    });

    it('section headings are unique', () => {
      const headings = sections.map((s) => s.heading);
      expect(new Set(headings).size).toBe(headings.length);
    });
  });

  describe('getContactContent', () => {
    const info = getContactContent();

    it('returns a non-empty email and address', () => {
      expect(typeof info.email).toBe('string');
      expect(info.email.length).toBeGreaterThan(0);
      expect(info.email).toContain('@');
      expect(typeof info.address).toBe('string');
      expect(info.address.length).toBeGreaterThan(0);
    });

    it('every social link has a label and an href', () => {
      const socials = info.socials ?? [];
      for (const social of socials) {
        expect(typeof social.label).toBe('string');
        expect(social.label.length).toBeGreaterThan(0);
        expect(typeof social.href).toBe('string');
        expect(social.href.length).toBeGreaterThan(0);
      }
    });
  });
});