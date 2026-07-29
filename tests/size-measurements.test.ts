import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIZE_MEASUREMENTS,
  HOUSE_MEASUREMENT_TABLE,
  formatMeasurementValue,
  isSizeGroup,
  measurementForSize,
  measurementsForSizes,
  parseSizeMeasurements,
  resolveSizeMeasurements,
} from '@/lib/size-measurements';

// ---------------------------------------------------------------------------
// Size measurements (lib/size-measurements) — the per-size chest/length
// readout under the size selector. The contract under test: the metafield
// JSON parses tolerantly (anything incomplete/invalid → undefined, never a
// broken PDP), grading resolves every size from the anchor by the per-step
// increments — up adds, down subtracts, rounded to the nearest half unit —
// and the readout ALWAYS has a config to render with: the product's own
// metafield when present, otherwise the house size block (pit-to-pit chest /
// HPS body length, matching the size guide's garment grid exactly).
// ---------------------------------------------------------------------------

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

describe('parseSizeMeasurements', () => {
  it('parses the preferred shape with defaults applied', () => {
    expect(parseSizeMeasurements('{"anchor": "L", "chest": 23, "length": 46}')).toEqual({
      unit: 'in',
      anchorSize: 'L',
      chest: 23,
      length: 46,
      chestStep: 5,
      lengthStep: 5,
    });
  });

  it('accepts explicit steps, cm unit, anchorSize alias and numeric strings', () => {
    expect(
      parseSizeMeasurements(
        '{"anchorSize": "M", "chest": "58", "length": "70", "unit": "cm", "chestStep": "4", "lengthStep": 2}',
      ),
    ).toEqual({
      unit: 'cm',
      anchorSize: 'M',
      chest: 58,
      length: 70,
      chestStep: 4,
      lengthStep: 2,
    });
  });

  it('returns undefined for missing/invalid input', () => {
    expect(parseSizeMeasurements(undefined)).toBeUndefined();
    expect(parseSizeMeasurements(null)).toBeUndefined();
    expect(parseSizeMeasurements('')).toBeUndefined();
    expect(parseSizeMeasurements('not json')).toBeUndefined();
    expect(parseSizeMeasurements('42')).toBeUndefined();
  });

  it('returns undefined when required fields are missing or non-positive', () => {
    expect(parseSizeMeasurements('{"chest": 23, "length": 46}')).toBeUndefined(); // no anchor
    expect(parseSizeMeasurements('{"anchor": "L", "length": 46}')).toBeUndefined(); // no chest
    expect(parseSizeMeasurements('{"anchor": "L", "chest": 23}')).toBeUndefined(); // no length
    expect(parseSizeMeasurements('{"anchor": " ", "chest": 23, "length": 46}')).toBeUndefined();
    expect(parseSizeMeasurements('{"anchor": "L", "chest": 0, "length": 46}')).toBeUndefined();
    expect(parseSizeMeasurements('{"anchor": "L", "chest": 23, "length": -1}')).toBeUndefined();
  });

  it('returns undefined for negative steps', () => {
    expect(
      parseSizeMeasurements('{"anchor": "L", "chest": 23, "length": 46, "chestStep": -5}'),
    ).toBeUndefined();
  });
});

describe('measurementForSize / measurementsForSizes', () => {
  const config = parseSizeMeasurements('{"anchor": "L", "chest": 23, "length": 46}')!;

  it('resolves the anchor size itself', () => {
    expect(measurementForSize(config, SIZES, 'L')).toEqual({ chest: 23, length: 46 });
  });

  it('adds 5/5 going up and subtracts 5/5 going down', () => {
    expect(measurementForSize(config, SIZES, 'XL')).toEqual({ chest: 28, length: 51 });
    expect(measurementForSize(config, SIZES, 'XXL')).toEqual({ chest: 33, length: 56 });
    expect(measurementForSize(config, SIZES, 'M')).toEqual({ chest: 18, length: 41 });
    expect(measurementForSize(config, SIZES, 'XS')).toEqual({ chest: 8, length: 31 });
  });

  it('matches sizes and the anchor case-insensitively', () => {
    expect(measurementForSize(config, ['xs', 's', 'l'], 'L')).toEqual({ chest: 23, length: 46 });
    expect(measurementForSize(config, SIZES, 'l')).toEqual({ chest: 23, length: 46 });
  });

  it('returns undefined when the size or the anchor is not in the list', () => {
    expect(measurementForSize(config, SIZES, 'XXXL')).toBeUndefined();
    expect(measurementForSize(config, ['S', 'M'], 'S')).toBeUndefined(); // anchor L absent
  });

  it('rounds fractional gradings to the nearest half unit', () => {
    const fractional = parseSizeMeasurements(
      '{"anchor": "M", "chest": 20.4, "length": 46.5, "chestStep": 2.5, "lengthStep": 1.5}',
    )!;
    expect(measurementForSize(fractional, ['S', 'M', 'L'], 'L')).toEqual({ chest: 23, length: 48 });
    expect(measurementForSize(fractional, ['S', 'M', 'L'], 'S')).toEqual({ chest: 18, length: 45 });
    // Half-inch grading (the house block's shape) keeps its halves.
    const halves = parseSizeMeasurements(
      '{"anchor": "M", "chest": 24, "length": 27.5, "chestStep": 1.5, "lengthStep": 1}',
    )!;
    expect(measurementForSize(halves, ['S', 'M', 'L'], 'L')).toEqual({ chest: 25.5, length: 28.5 });
    expect(measurementForSize(halves, ['S', 'M', 'L'], 'S')).toEqual({ chest: 22.5, length: 26.5 });
  });

  it('maps every size, aligned with the input list', () => {
    expect(measurementsForSizes(config, ['M', 'L', 'XL'])).toEqual([
      { chest: 18, length: 41 },
      { chest: 23, length: 46 },
      { chest: 28, length: 51 },
    ]);
  });
});

describe('resolveSizeMeasurements (metafield or house block)', () => {
  it('passes a product metafield config through untouched', () => {
    const own = parseSizeMeasurements(
      '{"anchor": "L", "chest": 61, "length": 72, "unit": "cm", "chestStep": 2, "lengthStep": 2}',
    )!;
    expect(resolveSizeMeasurements(own, SIZES)).toBe(own);
  });

  it('falls back to the house block anchored on M', () => {
    const resolved = resolveSizeMeasurements(undefined, SIZES)!;
    expect(resolved).toEqual({
      ...DEFAULT_SIZE_MEASUREMENTS,
      anchorSize: 'M',
      table: HOUSE_MEASUREMENT_TABLE,
    });
    // Table-covered sizes use the exact guide values (the block's S→M chest
    // step is +1, not the linear +1.5); sizes outside the table (XS, …)
    // extend linearly from the anchor: 24 − 2×1.5 chest, 27.5 − 2×1 length.
    expect(measurementsForSizes(resolved, SIZES)).toEqual([
      { chest: 21, length: 25.5 }, // XS — linear, not in the table
      { chest: 23, length: 26.5 }, // S — table
      { chest: 24, length: 27.5 }, // M — table
      { chest: 25.5, length: 28.5 }, // L — table
      { chest: 27, length: 29.5 }, // XL — table
      { chest: 28.5, length: 30.5 }, // XXL — table
    ]);
  });

  it('matches the size guide garment grid at every table size', () => {
    const resolved = resolveSizeMeasurements(undefined, ['S', 'M', 'L', 'XL', 'XXL'])!;
    // Same numbers as lib/size-guide's GARMENT_MEASUREMENT_ROWS:
    // chest (pit to pit) 23 / 24 / 25½ / 27 / 28½,
    // body length (HPS)  26½ / 27½ / 28½ / 29½ / 30½.
    expect(measurementsForSizes(resolved, ['S', 'M', 'L', 'XL', 'XXL'])).toEqual([
      { chest: 23, length: 26.5 },
      { chest: 24, length: 27.5 },
      { chest: 25.5, length: 28.5 },
      { chest: 27, length: 29.5 },
      { chest: 28.5, length: 30.5 },
    ]);
  });

  it('re-centres the fallback anchor on the middle size when there is no M', () => {
    const resolved = resolveSizeMeasurements(undefined, ['S', 'L', 'XL'])!;
    expect(resolved.anchorSize).toBe('L');
    // Table values still win — the anchor only drives sizes the table misses.
    expect(measurementForSize(resolved, ['S', 'L', 'XL'], 'L')).toEqual({ chest: 25.5, length: 28.5 });
    expect(measurementForSize(resolved, ['S', 'L', 'XL'], 'S')).toEqual({ chest: 23, length: 26.5 });
  });

  it('matches table sizes case-insensitively', () => {
    const resolved = resolveSizeMeasurements(undefined, ['s', 'm', 'l'])!;
    expect(measurementForSize(resolved, ['s', 'm', 'l'], 'm')).toEqual({ chest: 24, length: 27.5 });
  });

  it('returns undefined only when there are no sizes at all', () => {
    expect(resolveSizeMeasurements(undefined, [])).toBeUndefined();
  });
});

describe('formatMeasurementValue', () => {
  it('prints whole inches plain and halves with the ½ glyph, like the guide', () => {
    expect(formatMeasurementValue(24)).toBe('24');
    expect(formatMeasurementValue(27.5)).toBe('27½');
    expect(formatMeasurementValue(0.5)).toBe('0½');
  });

  it('prints any other fraction as-is', () => {
    expect(formatMeasurementValue(23.25)).toBe('23.25');
  });
});

describe('isSizeGroup', () => {
  it('matches "size" case-insensitively and ignores padding', () => {
    expect(isSizeGroup('Size')).toBe(true);
    expect(isSizeGroup(' size ')).toBe(true);
    expect(isSizeGroup('Color')).toBe(false);
    expect(isSizeGroup('Length')).toBe(false);
  });
});
