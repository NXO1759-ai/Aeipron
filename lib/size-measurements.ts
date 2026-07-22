// ---------------------------------------------------------------------------
// Size measurements — the per-size "CHEST … · LENGTH …" readout under the
// sliding-marker size selector (components/SizeSelector.tsx).
//
// Garments grade between sizes: each step up adds a fixed increment to the
// chest and length, each step down subtracts it. The model is therefore an
// ANCHOR size with known measurements plus per-step increments:
//
//   { "unit": "in", "anchor": "L", "chest": 23, "length": 46,
//     "chestStep": 5, "lengthStep": 3 }
//
//   → M = 18 / 43, L = 23 / 46, XL = 28 / 49 …
//
// The data comes from the product's `custom.size_measurements` metafield
// (type: json), so EVERY product page can carry different numbers, units and
// size ranges — nothing is hardcoded per product. Anything unparseable or
// incomplete resolves to `undefined` (the readout simply doesn't render) —
// a bad metafield value can never break the product page.
//
// Pure module (no React, no DOM): fully unit-testable in the node env.
// ---------------------------------------------------------------------------

/** A product's size-grading config, parsed from the metafield. */
export interface SizeMeasurements {
  /** Display unit — rendered uppercased ("IN" / "CM"). */
  unit: 'in' | 'cm';
  /** The size the base chest/length belong to (matched case-insensitively). */
  anchorSize: string;
  /** Chest measurement at the anchor size. */
  chest: number;
  /** Length measurement at the anchor size. */
  length: number;
  /** Chest increment per size step (down-counts for smaller sizes). */
  chestStep: number;
  /** Length increment per size step. */
  lengthStep: number;
}

/** A single size's resolved measurements (whole units, like a size chart). */
export interface SizeMeasurement {
  chest: number;
  length: number;
}

const DEFAULT_CHEST_STEP = 5;
const DEFAULT_LENGTH_STEP = 3;

function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toUnit(raw: unknown): 'in' | 'cm' {
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'cm' ? 'cm' : 'in';
}

/**
 * Parse the `custom.size_measurements` metafield value (a JSON string) into a
 * SizeMeasurements config. `undefined`/invalid/incomplete input yields
 * `undefined` — the PDP then renders no measurement readout at all.
 *
 * Accepted keys: `anchor` (or `anchorSize`), `chest`, `length` are required;
 * `unit` ('in' | 'cm', default 'in'), `chestStep` (default 5) and
 * `lengthStep` (default 3) are optional. Numbers may be JSON numbers or
 * numeric strings, so the merchant can paste whichever is convenient.
 */
export function parseSizeMeasurements(json: string | undefined | null): SizeMeasurements | undefined {
  if (!json) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (data == null || typeof data !== 'object') return undefined;

  const record = data as Record<string, unknown>;
  const anchorRaw = record.anchor ?? record.anchorSize;
  const chest = toNumber(record.chest);
  const length = toNumber(record.length);
  if (typeof anchorRaw !== 'string' || anchorRaw.trim() === '') return undefined;
  if (chest == null || chest <= 0 || length == null || length <= 0) return undefined;

  const chestStep = toNumber(record.chestStep) ?? DEFAULT_CHEST_STEP;
  const lengthStep = toNumber(record.lengthStep) ?? DEFAULT_LENGTH_STEP;
  if (chestStep < 0 || lengthStep < 0) return undefined;

  return {
    unit: toUnit(record.unit),
    anchorSize: anchorRaw.trim(),
    chest,
    length,
    chestStep,
    lengthStep,
  };
}

/** True when an option group should carry the garment measurements (by name). */
export function isSizeGroup(name: string): boolean {
  return name.trim().toLowerCase() === 'size';
}

/**
 * Resolve the measurements for ONE size: the anchor's values plus the
 * per-step increment for each position away from the anchor in the size list.
 * `undefined` when the size (or the anchor) isn't in the list.
 */
export function measurementForSize(
  config: SizeMeasurements,
  sizes: readonly string[],
  size: string,
): SizeMeasurement | undefined {
  const lowered = sizes.map((s) => s.toLowerCase());
  const index = lowered.indexOf(size.toLowerCase());
  const anchorIndex = lowered.indexOf(config.anchorSize.toLowerCase());
  if (index === -1 || anchorIndex === -1) return undefined;
  const steps = index - anchorIndex;
  return {
    chest: Math.round(config.chest + steps * config.chestStep),
    length: Math.round(config.length + steps * config.lengthStep),
  };
}

/**
 * Resolve measurements for EVERY size, aligned with `sizes` (undefined slots
 * where a size can't be resolved). This is the array SizeSelector consumes.
 */
export function measurementsForSizes(
  config: SizeMeasurements,
  sizes: readonly string[],
): (SizeMeasurement | undefined)[] {
  return sizes.map((size) => measurementForSize(config, sizes, size));
}
