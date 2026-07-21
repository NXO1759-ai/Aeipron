import { describe, it, expect } from 'vitest';
import {
  enabledIndexes,
  firstEnabledIndex,
  lastEnabledIndex,
  nextEnabledIndex,
  splitOptionValues,
} from '@/lib/size-selector';

// ---------------------------------------------------------------------------
// Size selector (lib/size-selector) — pure keyboard-navigation helpers. The
// contract under test: arrow-key navigation always lands on an ENABLED size,
// skipping sold-out runs and wrapping around both ends; when everything is
// sold out, navigation is a safe no-op instead of throwing or focusing void.
// Also covers splitOptionValues, the PDP option-group → selector mapping.
// ---------------------------------------------------------------------------

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

describe('splitOptionValues — PDP option group → SizeSelector props', () => {
  it('maps every value to sizes, in display order', () => {
    const { sizes } = splitOptionValues([
      { value: 'S', inStock: true },
      { value: 'M', inStock: false },
      { value: 'L', inStock: true },
    ]);
    expect(sizes).toEqual(['S', 'M', 'L']);
  });

  it('collects out-of-stock values into soldOut', () => {
    const { soldOut } = splitOptionValues([
      { value: 'S', inStock: true },
      { value: 'XL', inStock: false },
      { value: 'XXL', inStock: false },
    ]);
    expect(soldOut).toEqual(['XL', 'XXL']);
  });

  it('handles empty and all-in-stock groups', () => {
    expect(splitOptionValues([])).toEqual({ sizes: [], soldOut: [] });
    expect(splitOptionValues([{ value: 'OS', inStock: true }])).toEqual({ sizes: ['OS'], soldOut: [] });
  });
});

describe('enabledIndexes', () => {
  it('returns the indexes of enabled sizes in ascending order', () => {
    expect(enabledIndexes(SIZES, ['S', 'XL'])).toEqual([0, 2, 3, 5]);
    expect(enabledIndexes(SIZES)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('returns an empty list when every size is sold out', () => {
    expect(enabledIndexes(SIZES, SIZES)).toEqual([]);
  });
});

describe('firstEnabledIndex / lastEnabledIndex', () => {
  it('firstEnabledIndex skips leading sold-out sizes', () => {
    expect(firstEnabledIndex(SIZES, ['XS', 'S'])).toBe(2);
    expect(firstEnabledIndex(SIZES)).toBe(0);
  });

  it('lastEnabledIndex skips trailing sold-out sizes', () => {
    expect(lastEnabledIndex(SIZES, ['XL', 'XXL'])).toBe(3);
    expect(lastEnabledIndex(SIZES)).toBe(5);
  });

  it('both return -1 when every size is sold out', () => {
    expect(firstEnabledIndex(SIZES, SIZES)).toBe(-1);
    expect(lastEnabledIndex(SIZES, SIZES)).toBe(-1);
  });
});

describe('nextEnabledIndex', () => {
  it('steps to the next enabled size in either direction', () => {
    expect(nextEnabledIndex(SIZES, [], 2, +1)).toBe(3);
    expect(nextEnabledIndex(SIZES, [], 2, -1)).toBe(1);
  });

  it('skips runs of sold-out sizes', () => {
    expect(nextEnabledIndex(SIZES, ['M', 'L'], 1, +1)).toBe(4);
    expect(nextEnabledIndex(SIZES, ['M', 'L'], 4, -1)).toBe(1);
  });

  it('wraps around both ends', () => {
    expect(nextEnabledIndex(SIZES, [], 5, +1)).toBe(0);
    expect(nextEnabledIndex(SIZES, [], 0, -1)).toBe(5);
    // …while still skipping sold-out sizes at the wrap point.
    expect(nextEnabledIndex(SIZES, ['XXL'], 4, +1)).toBe(0);
    expect(nextEnabledIndex(SIZES, ['XS'], 1, -1)).toBe(5);
  });

  it('starts from the first/last enabled size when current is -1 or sold out', () => {
    expect(nextEnabledIndex(SIZES, ['XXL'], -1, +1)).toBe(0);
    expect(nextEnabledIndex(SIZES, ['XXL'], -1, -1)).toBe(4);
    expect(nextEnabledIndex(SIZES, ['XXL'], 5, +1)).toBe(0);
  });

  it('is a no-op when every size is sold out', () => {
    expect(nextEnabledIndex(SIZES, SIZES, 3, +1)).toBe(3);
    expect(nextEnabledIndex(SIZES, SIZES, -1, -1)).toBe(-1);
  });
});
