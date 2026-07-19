import { describe, it, expect } from 'vitest';

import { resolveSwatch, normalizeHex, NEUTRAL_SWATCH_HEX } from '@/lib/color';

// ---------------------------------------------------------------------------
// resolveSwatch — layered color resolution for the product-page color picker.
//
// The picker must render a visual swatch for ANY color the merchant configures,
// with or without Shopify Admin swatch data. The resolution order is:
//   swatchImage → Shopify colorHex → literal-hex value → named color → hash.
// ---------------------------------------------------------------------------

describe('resolveSwatch — image priority', () => {
  it('returns an image swatch when swatchImage is present', () => {
    expect(resolveSwatch('Black', null, 'https://cdn/color.jpg')).toEqual({
      kind: 'image',
      url: 'https://cdn/color.jpg',
    });
  });

  it('image wins over a Shopify hex', () => {
    // A texture/pattern image represents the color better than a flat hex.
    expect(resolveSwatch('Tweed', '#000000', 'https://cdn/tweed.jpg')).toEqual({
      kind: 'image',
      url: 'https://cdn/tweed.jpg',
    });
  });

  it('ignores a blank/whitespace swatchImage', () => {
    expect(resolveSwatch('Black', null, '   ')).toEqual({ kind: 'color', hex: '#000000' });
    expect(resolveSwatch('Black', null, '')).toEqual({ kind: 'color', hex: '#000000' });
  });
});

describe('resolveSwatch — Shopify hex (colorHex)', () => {
  it('uses the Shopify swatch color when present', () => {
    expect(resolveSwatch('Black', '#1a2b3c')).toEqual({ kind: 'color', hex: '#1a2b3c' });
  });

  it('normalizes a 3-digit Shopify hex to 6 digits', () => {
    expect(resolveSwatch('Red', '#f00')).toEqual({ kind: 'color', hex: '#ff0000' });
  });

  it('lowercases an uppercase Shopify hex', () => {
    expect(resolveSwatch('Blue', '#1A2B3C')).toEqual({ kind: 'color', hex: '#1a2b3c' });
  });

  it('normalizes a 3-digit Shopify hex to 6 digits', () => {
    expect(resolveSwatch('Red', '#f00')).toEqual({ kind: 'color', hex: '#ff0000' });
  });

  it('strips the alpha channel from an 8-digit Shopify hex (#rrggbbaa)', () => {
    // Alpha is meaningless on an opaque swatch dot — strip it.
    expect(resolveSwatch('Blue', '#1a2b3cff')).toEqual({ kind: 'color', hex: '#1a2b3c' });
  });

  it('strips the alpha channel from a 4-digit Shopify hex (#rgba)', () => {
    expect(resolveSwatch('Red', '#f00f')).toEqual({ kind: 'color', hex: '#ff0000' });
  });

  it('lowercases an uppercase Shopify hex', () => {
    expect(resolveSwatch('Blue', '#1A2B3C')).toEqual({ kind: 'color', hex: '#1a2b3c' });
  });

  it('ignores an invalid Shopify hex and falls through', () => {
    // Not a valid hex → falls through to the named-color / hash path.
    const swatch = resolveSwatch('Black', 'not-a-color');
    expect(swatch).toEqual({ kind: 'color', hex: '#000000' });
  });
});

describe('resolveSwatch — literal hex in the value', () => {
  it('parses a #rrggbb value as a color', () => {
    expect(resolveSwatch('#1a2b3c')).toEqual({ kind: 'color', hex: '#1a2b3c' });
  });

  it('parses a #rgb value and expands it', () => {
    expect(resolveSwatch('#abc')).toEqual({ kind: 'color', hex: '#aabbcc' });
  });

  it('parses a #rrggbbaa value and strips the alpha', () => {
    expect(resolveSwatch('#1a2b3cff')).toEqual({ kind: 'color', hex: '#1a2b3c' });
  });

  it('requires a leading # so a 3-letter color name is not misread as hex', () => {
    // "cab" is all-hex letters but is a color NAME, not a hex — without the
    // leading-# requirement it would render #ccaabb. It must fall through to
    // the hash fallback (a deterministic, unrelated color) instead.
    const cab = resolveSwatch('cab');
    expect(cab.kind).toBe('color');
    if (cab.kind === 'color') expect(cab.hex).not.toBe('#ccaabb');
  });

  it('falls through a bare 6-digit hex (no #) to the named/hash path', () => {
    // Requiring # is the safer contract; a bare hex without # is treated as a
    // color name and resolves via the fallback (here, the hash).
    const swatch = resolveSwatch('1a2b3c');
    expect(swatch.kind).toBe('color');
    if (swatch.kind === 'color') expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('rejects a non-hex value and falls through to the named path', () => {
    expect(resolveSwatch('Black')).toEqual({ kind: 'color', hex: '#000000' });
  });
});

describe('resolveSwatch — named colors', () => {
  it('resolves a CSS named color (case-insensitive)', () => {
    expect(resolveSwatch('red')).toEqual({ kind: 'color', hex: '#ff0000' });
    expect(resolveSwatch('RED')).toEqual({ kind: 'color', hex: '#ff0000' });
    expect(resolveSwatch('Crimson')).toEqual({ kind: 'color', hex: '#dc143c' });
  });

  it('resolves an apparel color name not in the CSS set', () => {
    expect(resolveSwatch('Champagne')).toEqual({ kind: 'color', hex: '#e8d5b7' });
    expect(resolveSwatch('BURGUNDY')).toEqual({ kind: 'color', hex: '#6e0d2a' });
    expect(resolveSwatch('camel')).toEqual({ kind: 'color', hex: '#c69a59' });
  });

  it('resolves a multi-word name via the full phrase', () => {
    expect(resolveSwatch('Midnight Blue')).toEqual({ kind: 'color', hex: '#191970' });
    expect(resolveSwatch('dusty rose')).toEqual({ kind: 'color', hex: '#ff007f' });
  });

  it('falls back to the last word for an unlisted multi-word name', () => {
    // "Vintage Wine" isn't listed, but "wine" is in the apparel map.
    expect(resolveSwatch('Vintage Wine')).toEqual({ kind: 'color', hex: '#722f37' });
    // "Neon Crimson" isn't listed, but "crimson" is a CSS color.
    expect(resolveSwatch('Neon Crimson')).toEqual({ kind: 'color', hex: '#dc143c' });
  });

  it('trims surrounding whitespace before lookup', () => {
    expect(resolveSwatch('  Black  ')).toEqual({ kind: 'color', hex: '#000000' });
  });
});

describe('resolveSwatch — deterministic hash fallback', () => {
  it('returns a stable hex for an unknown color name (same input → same output)', () => {
    const a = resolveSwatch('Galaxy Flux');
    const b = resolveSwatch('Galaxy Flux');
    expect(a).toEqual(b);
    expect(a.kind).toBe('color');
  });

  it('different unknown names resolve to different colors', () => {
    const a = resolveSwatch('Zyzyxia');
    const b = resolveSwatch('Qwertyui');
    expect(a).not.toEqual(b);
  });

  it('always returns a 6-digit #rrggbb hex', () => {
    const swatch = resolveSwatch('Some Unknown Color 42');
    expect(swatch.kind).toBe('color');
    if (swatch.kind === 'color') {
      expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('falls back to the neutral swatch for an empty value', () => {
    expect(resolveSwatch('')).toEqual({ kind: 'color', hex: NEUTRAL_SWATCH_HEX });
    expect(resolveSwatch('   ')).toEqual({ kind: 'color', hex: NEUTRAL_SWATCH_HEX });
  });
});

describe('normalizeHex', () => {
  it('normalizes #rgb → #rrggbb', () => {
    expect(normalizeHex('#f00')).toBe('#ff0000');
    expect(normalizeHex('abc')).toBe('#aabbcc');
  });

  it('passes valid #rrggbb through (lowercased)', () => {
    expect(normalizeHex('#1A2B3C')).toBe('#1a2b3c');
  });

  it('strips the alpha channel from #rrggbbaa', () => {
    expect(normalizeHex('#1a2b3cff')).toBe('#1a2b3c');
    expect(normalizeHex('1a2b3c4d')).toBe('#1a2b3c');
  });

  it('strips the alpha channel from #rgba', () => {
    expect(normalizeHex('#f00f')).toBe('#ff0000');
    expect(normalizeHex('f00a')).toBe('#ff0000');
  });

  it('returns null for invalid input', () => {
    expect(normalizeHex('#gggggg')).toBeNull();
    expect(normalizeHex('#12')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#1234567')).toBeNull(); // 7 digits — neither 3/4/6/8
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});