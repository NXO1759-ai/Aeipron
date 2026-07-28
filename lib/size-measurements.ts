// ---------------------------------------------------------------------------
// Size measurements — the per-size "CHEST … · LENGTH …" readout under the
// sliding-marker size selector (components/SizeSelector.tsx).
//
// The readout's numbers MATCH THE HOUSE SIZE GUIDE (lib/size-guide.ts — the
// "Product Sizing" dropdown on the PDP): chest = pit-to-pit, length = body
// length (HPS). When the product carries a `custom.size_measurements`
// metafield (type: json) it drives the numbers; when it doesn't, the readout
// falls back to the house block — the exact per-size values in
// HOUSE_MEASUREMENT_TABLE, extended linearly (anchor M, +1.5 chest / +1
// length per step) for sizes the table doesn't cover (XS, 3XL, …).
//
// Garments grade between sizes: each step up adds a fixed increment to the
// chest and length, each step down subtracts it. The linear model is an
// ANCHOR size with known measurements plus per-step increments:
//
//   { "unit": "in", "anchor": "M", "chest": 24, "length": 27.5,
//     "chestStep": 1.5, "lengthStep": 1 }
//
//   → S = 22.5 / 26.5, M = 24 / 27.5, L = 25.5 / 28.5 …
//
// Metafield parse defaults stay ±5 per step (unchanged behaviour for any
// merchant metafield that omits the step fields). Anything unparseable or
// incomplete in the metafield resolves to `undefined` and falls back to the
// house block — a bad metafield value can never break the product page.
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
  /** Exact per-size values that override the linear grading. Set ONLY by the
   * house fallback (never by a metafield), so the readout matches the size
   * guide block exactly at every covered size — the block's S→M chest step
   * is +1 while every later step is +1.5, which no linear model captures. */
  table?: Readonly<Record<string, SizeMeasurement>>;
}

/** A single size's resolved measurements (halves allowed, like the guide). */
export interface SizeMeasurement {
  chest: number;
  length: number;
}

/** Parse defaults for metafields that omit the step fields (legacy ±5). */
const DEFAULT_CHEST_STEP = 5;
const DEFAULT_LENGTH_STEP = 5;

/**
 * The house default grading, used whenever a product has no (valid)
 * `custom.size_measurements` metafield. Matches the size guide block: chest
 * = pit-to-pit, length = body length (HPS) — 24 IN / 27½ IN at the anchor
 * size M, grading +1.5 chest / +1 length per step. Sizes covered by
 * HOUSE_MEASUREMENT_TABLE use the table's exact values instead. The anchor
 * re-centres on the middle of the actual size list when a product has no M.
 */
export const DEFAULT_SIZE_MEASUREMENTS: SizeMeasurements = {
  unit: 'in',
  anchorSize: 'M',
  chest: 24,
  length: 27.5,
  chestStep: 1.5,
  lengthStep: 1,
};

/** Exact house-block values per size: pit-to-pit chest / HPS body length
 * (the same numbers shown in the size guide's garment grid). */
export const HOUSE_MEASUREMENT_TABLE: Readonly<Record<string, SizeMeasurement>> = {
  S: { chest: 23, length: 26.5 },
  M: { chest: 24, length: 27.5 },
  L: { chest: 25.5, length: 28.5 },
  XL: { chest: 27, length: 29.5 },
  XXL: { chest: 28.5, length: 30.5 },
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

/** Round to the nearest half unit — the house block grades in half inches,
 * and integer metafield configs stay integers under the same rule. */
const roundHalf = (value: number) => Math.round(value * 2) / 2;

/**
 * Parse the `custom.size_measurements` metafield value (a JSON string) into a
 * SizeMeasurements config. `undefined`/invalid/incomplete input yields
 * `undefined` — the PDP then falls back to the house block.
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
 * Resolve the measurements for ONE size: the config's exact table value when
 * it carries one for the size (house fallback only), otherwise the anchor's
 * values plus the per-step increment for each position away from the anchor
 * in the size list — rounded to the nearest half unit. `undefined` when the
 * size (or the anchor) isn't in the list.
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

  // Exact house-block values win over the linear grading when the config
  // carries its table (only the house fallback does — never a metafield).
  if (config.table) {
    const key = Object.keys(config.table).find(
      (candidate) => candidate.toLowerCase() === size.toLowerCase(),
    );
    if (key) return config.table[key];
  }

  const steps = index - anchorIndex;
  return {
    chest: roundHalf(config.chest + steps * config.chestStep),
    length: roundHalf(config.length + steps * config.lengthStep),
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
 * when present, otherwise the house block (DEFAULT_SIZE_MEASUREMENTS +
 * HOUSE_MEASUREMENT_TABLE). For the fallback, the anchor is size M when the
 * size list has one; when it doesn't (e.g. S–XL only), the anchor re-centres
 * on the middle of the actual list so the grading still fans out from the
 * middle size. Returns `undefined` only when there are no sizes at all.
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
  return { ...DEFAULT_SIZE_MEASUREMENTS, anchorSize: anchor, table: HOUSE_MEASUREMENT_TABLE };
}

/**
 * Display format for the readout, matching the size guide tables: whole
 * inches plain ("24"), half inches with the ½ glyph ("27½"). Anything else
 * (a merchant metafield with quarter-inch grading, say) prints as-is.
 */
export function formatMeasurementValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value % 1) === 0.5) {
    const sign = value < 0 ? '-' : '';
    return `${sign}${Math.floor(Math.abs(value))}½`;
  }
  return String(value);
}
