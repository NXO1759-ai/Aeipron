import { describe, it, expect } from 'vitest';
import {
  isSizeGroup,
  measurementForSize,
  measurementsForSizes,
  parseSizeMeasurements,
} from '@/lib/size-measurements';

// ---------------------------------------------------------------------------
// Size measurements (lib/size-measurements) — the per-size chest/length
// readout under the size selector. The contract under test: the metafield
// JSON parses tolerantly (anything incomplete/invalid → undefined, never a
// broken PDP), and grading resolves every size from the anchor by the
// per-step increments — up adds, down subtracts.
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
      lengthStep: 3,
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

  it('adds the increments going up and subtracts them going down', () => {
    expect(measurementForSize(config, SIZES, 'XL')).toEqual({ chest: 28, length: 49 });
    expect(measurementForSize(config, SIZES, 'XXL')).toEqual({ chest: 33, length: 52 });
    expect(measurementForSize(config, SIZES, 'M')).toEqual({ chest: 18, length: 43 });
    expect(measurementForSize(config, SIZES, 'XS')).toEqual({ chest: 8, length: 37 });
  });

  it('matches sizes and the anchor case-insensitively', () => {
    expect(measurementForSize(config, ['xs', 's', 'l'], 'L')).toEqual({ chest: 23, length: 46 });
    expect(measurementForSize(config, SIZES, 'l')).toEqual({ chest: 23, length: 46 });
  });

  it('returns undefined when the size or the anchor is not in the list', () => {
    expect(measurementForSize(config, SIZES, 'XXXL')).toBeUndefined();
    expect(measurementForSize(config, ['S', 'M'], 'S')).toBeUndefined(); // anchor L absent
  });

  it('rounds fractional gradings to whole units', () => {
    const fractional = parseSizeMeasurements(
      '{"anchor": "M", "chest": 20.4, "length": 46.5, "chestStep": 2.5, "lengthStep": 1.5}',
    )!;
    expect(measurementForSize(fractional, ['S', 'M', 'L'], 'L')).toEqual({ chest: 23, length: 48 });
    expect(measurementForSize(fractional, ['S', 'M', 'L'], 'S')).toEqual({ chest: 18, length: 45 });
  });

  it('maps every size, aligned with the input list', () => {
    expect(measurementsForSizes(config, ['M', 'L', 'XL'])).toEqual([
      { chest: 18, length: 43 },
      { chest: 23, length: 46 },
      { chest: 28, length: 49 },
    ]);
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
