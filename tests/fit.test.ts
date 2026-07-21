import { describe, it, expect } from 'vitest';
import { parseFitScale, fitLabel, fitMarkerPercent, FIT_TICKS } from '@/lib/fit';

// ---------------------------------------------------------------------------
// Fit scale (lib/fit) — pure parsing + labelling for the `custom.review` json
// metafield. The contract under test: ANY input resolves to a clamped
// -2..+2 integer, so a bad metafield value can never break the product page;
// absent/unparseable input rests at 0 (True To Size).
// ---------------------------------------------------------------------------

describe('parseFitScale', () => {
  it('defaults to 0 (True To Size) for absent input', () => {
    expect(parseFitScale(undefined)).toBe(0);
    expect(parseFitScale(null)).toBe(0);
    expect(parseFitScale('')).toBe(0);
  });

  it('parses the preferred object shape {"fit": n}', () => {
    expect(parseFitScale('{"fit": -2}')).toBe(-2);
    expect(parseFitScale('{"fit": 0}')).toBe(0);
    expect(parseFitScale('{"fit": 2}')).toBe(2);
  });

  it('parses a bare number and numeric strings', () => {
    expect(parseFitScale('-1')).toBe(-1);
    expect(parseFitScale('1')).toBe(1);
    expect(parseFitScale('{"fit": "-1"}')).toBe(-1);
  });

  it('parses label strings (case/space/underscore tolerant)', () => {
    expect(parseFitScale('{"fit": "slightly_smaller"}')).toBe(-1);
    expect(parseFitScale('{"fit": "Slightly Larger"}')).toBe(1);
    expect(parseFitScale('"much_smaller"')).toBe(-2);
    expect(parseFitScale('"true_to_size"')).toBe(0);
  });

  it('clamps out-of-range numbers instead of overflowing the track', () => {
    expect(parseFitScale('{"fit": 9}')).toBe(2);
    expect(parseFitScale('{"fit": -9}')).toBe(-2);
  });

  it('rounds fractional positions to the nearest tick', () => {
    expect(parseFitScale('{"fit": 0.4}')).toBe(0);
    expect(parseFitScale('{"fit": -1.6}')).toBe(-2);
  });

  it('falls back to 0 for unparseable input', () => {
    expect(parseFitScale('not json')).toBe(0);
    expect(parseFitScale('{"fit": "banana"}')).toBe(0);
    expect(parseFitScale('{"other": 1}')).toBe(0);
    expect(parseFitScale('[1,2,3]')).toBe(0);
    expect(parseFitScale('{"fit": null}')).toBe(0);
  });
});

describe('fitLabel', () => {
  it('maps each tick to its display label', () => {
    expect(fitLabel(-2)).toBe('Much Smaller');
    expect(fitLabel(-1)).toBe('Slightly Smaller');
    expect(fitLabel(0)).toBe('True To Size');
    expect(fitLabel(1)).toBe('Slightly Larger');
    expect(fitLabel(2)).toBe('Much Larger');
  });
});

describe('fitMarkerPercent', () => {
  it('maps the -2..+2 range onto 0..100%', () => {
    expect(fitMarkerPercent(-2)).toBe(0);
    expect(fitMarkerPercent(-1)).toBe(25);
    expect(fitMarkerPercent(0)).toBe(50);
    expect(fitMarkerPercent(1)).toBe(75);
    expect(fitMarkerPercent(2)).toBe(100);
  });
});

describe('FIT_TICKS', () => {
  it('renders five evenly spaced ticks', () => {
    expect(FIT_TICKS).toEqual([-2, -1, 0, 1, 2]);
  });
});
