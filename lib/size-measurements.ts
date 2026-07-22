// ---------------------------------------------------------------------------
// Size measurements — the per-size "CHEST … · LENGTH …" readout under the
// sliding-marker size selector (components/SizeSelector.tsx).
//
// Garments grade between sizes: each step up adds a fixed increment to the
// chest and length, each step down subtracts it. The model is therefore an
// ANCHOR size with known measurements plus per-step increments:
//
//   { "unit": "in", "anchor": "M", "chest": 23, "length": 46,
//     "chestStep": 5, "lengthStep": 5 }
//
//   → S = 18 / 41, M = 23 / 46, L = 28 / 51 …
//
// Every Size group ALWAYS renders the readout: when the product carries a
// `custom.size_measurements` metafield (type: json) it drives the numbers —
// so every product page can carry different values, units and anchors —
// and when it doesn't, resolveSizeMeasurements() falls back to the house
// default above (23 IN / 46 IN at the middle size, ±5 per step). Anything
// unparseable or incomplete in the metafield resolves to `undefined` and
// also falls back — a bad metafield value can never break the product page.
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
const DEFAULT_LENGTH_STEP = 5;

/**
 * The house default grading, used whenever a product has no (valid)
 * `custom.size_measurements` metafield: 23 IN chest / 46 IN length at the
 * anchor size, ±5 per size step on both. The anchor is size M — "the medium
 * being the middle point" — and resolveSizeMeasurements() re-centres it on
 * the middle of the actual size list when a product has no M.
 */
export const DEFAULT_SIZE_MEASUREMENTS: SizeMeasurements = {
  unit: 'in',
  anchorSize: 'M',
  chest: 23,
  length: 46,
  chestStep: DEFAULT_CHEST_STEP,
  lengthStep: DEFAULT_LENGTH_STEP,
};

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
 * `lengthStep` (default 5) are optional. Numbers may be JSON numbers or
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

/**
 * The config the PDP should render with: the product's own metafield config
 * when present, otherwise the house default (DEFAULT_SIZE_MEASUREMENTS).
 * For the fallback, the anchor is size M when the size list has one; when it
 * doesn't (e.g. S–XL only), the anchor re-centres on the middle of the
 * actual list so the grading still fans out from the middle size. Returns
 * `undefined` only when there are no sizes at all.
 */
export function resolveSizeMeasurements(
  config: SizeMeasurements | undefined,
  sizes: readonly string[],
): SizeMeasurements | undefined {
  if (config) return config;
  if (sizes.length === 0) return undefined;
  const lowered = sizes.map((s) => s.toLowerCase());
  const anchor = lowered.includes(DEFAULT_SIZE_MEASUREMENTS.anchorSize.toLowerCase())
    ? DEFAULT_SIZE_MEASUREMENTS.anchorSize
    : sizes[Math.floor((sizes.length - 1) / 2)];
  return { ...DEFAULT_SIZE_MEASUREMENTS, anchorSize: anchor };
}
