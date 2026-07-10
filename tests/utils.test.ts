import { describe, it, expect } from 'vitest';
import { formatCurrency } from '@/lib/utils';

// ---------------------------------------------------------------------------
// formatCurrency tests.
//
// The cart UI relies on this for line prices, subtotals, and the checkout
// "Estimated total". It must never throw on display data — a malformed or
// unknown currency code must fall back to a safe decimal string, and a
// non-finite amount (NaN/Infinity) must return '0' rather than "NaN" / "∞".
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  describe('USD (default currency code)', () => {
    it('formats a whole-dollar amount with the $ symbol', () => {
      expect(formatCurrency(10)).toContain('$');
    });

    it('formats a fractional amount with two decimal places', () => {
      // USD has a 1/100 minor unit → always 2 fraction digits.
      expect(formatCurrency(12.5)).toMatch(/12\.50/);
    });

    it('uses the USD code when none is passed (default arg)', () => {
      expect(formatCurrency(0)).toContain('$');
    });

    it('formats large amounts with thousands separators', () => {
      expect(formatCurrency(1234.56)).toMatch(/1[,.]234\.56|1[,.]234,56/);
    });
  });

  describe('non-USD currency codes', () => {
    it('formats EUR with the € symbol', () => {
      expect(formatCurrency(12.5, 'EUR')).toContain('€');
    });

    it('formats GBP with the £ symbol', () => {
      expect(formatCurrency(50, 'GBP')).toContain('£');
    });

    it('honors the JPY currency (0 fraction digits — no minor unit)', () => {
      // JPY has no minor unit, so Intl must NOT render ".00" / ",00".
      const out = formatCurrency(1000, 'JPY');
      expect(out).toContain('¥');
      expect(out).not.toMatch(/\d[.,]00\b/);
    });
  });

  describe('fallback behavior', () => {
    it('returns a safe decimal string for an unknown currency code', () => {
      // An unrecognised code throws inside Intl; the catch returns toFixed(2).
      expect(formatCurrency(10, 'NOTACODE')).toBe('10.00');
    });

    it('returns a safe decimal string for an empty currency code', () => {
      expect(formatCurrency(10, '')).toBe('10.00');
    });

    it('returns "0" for NaN', () => {
      expect(formatCurrency(Number.NaN)).toBe('0');
    });

    it('returns "0" for Infinity', () => {
      expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe('0');
    });

    it('returns "0" for -Infinity', () => {
      expect(formatCurrency(Number.NEGATIVE_INFINITY)).toBe('0');
    });

    it('does NOT throw on a non-finite amount combined with a bad code', () => {
      expect(() => formatCurrency(Number.NaN, 'BOGUS')).not.toThrow();
    });
  });

  describe('edge amounts', () => {
    it('formats a zero amount', () => {
      expect(formatCurrency(0, 'USD')).toBe('$0.00');
    });

    it('formats a negative amount (refunds)', () => {
      expect(formatCurrency(-5, 'USD')).toBe('-$5.00');
    });
  });
});