// ---------------------------------------------------------------------------
// Size guide — the data behind the PDP "Product Sizing" disclosure and its
// "How to measure" modal (components/product/SizeGuide.tsx).
//
// This is the house size block, transcribed verbatim from the brand's size
// document — the same block every product uses, so it lives here as data
// instead of in a per-product metafield:
//
//   · BODY_MEASUREMENT_ROWS — the "pick your size by BODY chest" table
//     (size → chest range in IN and CM, US alpha, EU equivalent)
//   · HOW_WE_MEASURE — the three measurement definitions (HPS body length,
//     chest, sleeve from shoulder)
//   · FIT_NOTES — the four fit recommendations
//   · GARMENT_SIZES + GARMENT_MEASUREMENT_ROWS — the garment-spec grid shown
//     in the "How to measure" modal (the garment's own measurements per size,
//     in inches; halves use the ½ glyph, matching the document's "26 1/2")
//
// Pure module (no React, no DOM): fully unit-testable in the node env.
// ---------------------------------------------------------------------------

export interface BodyMeasurementRow {
  size: string;
  /** Body chest range in inches (en-dash range, e.g. "36–38"). */
  chestIn: string;
  /** Body chest range in centimeters. */
  chestCm: string;
  usAlpha: string;
  euEquivalent: string;
}

export const BODY_MEASUREMENT_ROWS: BodyMeasurementRow[] = [
  { size: 'S', chestIn: '36–38', chestCm: '91–97', usAlpha: 'S', euEquivalent: '46' },
  { size: 'M', chestIn: '38–40', chestCm: '97–102', usAlpha: 'M', euEquivalent: '48' },
  { size: 'L', chestIn: '40–42', chestCm: '102–107', usAlpha: 'L', euEquivalent: '50–52' },
  { size: 'XL', chestIn: '42–45', chestCm: '107–114', usAlpha: 'XL', euEquivalent: '52–54' },
  { size: 'XXL', chestIn: '45–48', chestCm: '114–122', usAlpha: 'XXL', euEquivalent: '54–56' },
];

export interface HowWeMeasureItem {
  /** The bolded term (e.g. "Body length (HPS)"). */
  term: string;
  description: string;
}

export const HOW_WE_MEASURE: HowWeMeasureItem[] = [
  {
    term: 'Body length (HPS)',
    description:
      'From the highest point of the shoulder (where the shoulder seam meets the collar) straight down to the bottom hem.',
  },
  {
    term: 'Chest',
    description:
      'Across the chest, 1" below the armhole, laid flat. Double it for full circumference.',
  },
  {
    term: 'Sleeve length (from shoulder)',
    description: 'From the shoulder seam, along the top of the sleeve, to the cuff opening.',
  },
];

export interface FitNote {
  /** The bolded lead-in (e.g. "Prefer a cleaner, closer fit?"). */
  lead: string;
  body: string;
}

export const FIT_NOTES: FitNote[] = [
  {
    lead: 'Designed relaxed.',
    body: 'Take your usual size for the intended relaxed fit — no sizing up needed.',
  },
  {
    lead: 'Prefer a cleaner, closer fit?',
    body: 'Size down one. The generous chest means a size down still wears comfortably.',
  },
  {
    lead: 'Prefer a true oversized, streetwear-forward look?',
    body: 'Size up one.',
  },
  {
    lead: 'Between sizes?',
    body: 'Size down for structure, size up for drape.',
  },
];

/** Size columns of the garment-spec grid (modal), left to right. */
export const GARMENT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;

export interface GarmentMeasurementRow {
  /** Row label (e.g. "Chest (pit to pit)"). */
  label: string;
  /** One value per GARMENT_SIZES column, in inches ("26½" style). */
  values: readonly string[];
}

export const GARMENT_MEASUREMENT_ROWS: GarmentMeasurementRow[] = [
  { label: 'Body length (HPS)', values: ['26½', '27½', '28½', '29½', '30½'] },
  { label: 'Chest (pit to pit)', values: ['23', '24', '25½', '27', '28½'] },
  { label: 'Chest (full circumference)', values: ['46', '48', '51', '54', '57'] },
  { label: 'Sleeve length (from shoulder)', values: ['23½', '24', '24½', '25', '25½'] },
];

/** Shown under the garment grid — the document's values are inches. */
export const GARMENT_MEASUREMENT_UNIT_NOTE = 'All measurements in inches.';
