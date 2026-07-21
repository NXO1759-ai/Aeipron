// ---------------------------------------------------------------------------
// Fit scale — the "Smaller … True To Size … Larger" indicator on the product
// page (inside the Reviews disclosure).
//
// The scale has five positions modelled as a number from -2 to +2:
//   -2  Much Smaller      0  True To Size      +2  Much Larger
//   -1  Slightly Smaller                       +1  Slightly Larger
//
// The value comes from the product's `custom.review` metafield (type: json).
// Accepted shapes, so the merchant can paste whichever is convenient:
//   { "fit": 0 }            — preferred (number -2..2)
//   { "fit": "slightly_smaller" }
//   0 | "true_to_size"      — bare number or label
// Anything unparseable falls back to 0 (True To Size) and out-of-range numbers
// are clamped — a bad metafield value can never break the product page.
//
// Rendering is marker-position driven (see components/product/FitScale), so
// upgrading from a static marker to a sliding scale later is a data change,
// not a component change.
// ---------------------------------------------------------------------------

export const FIT_MIN = -2;
export const FIT_MAX = 2;

/** Five tick positions, left to right. */
export const FIT_TICKS = [FIT_MIN, -1, 0, 1, FIT_MAX] as const;

const FIT_LABELS: Record<number, string> = {
  [-2]: 'Much Smaller',
  [-1]: 'Slightly Smaller',
  0: 'True To Size',
  1: 'Slightly Larger',
  2: 'Much Larger',
};

const FIT_ALIASES: Record<string, number> = {
  much_smaller: -2,
  runs_small: -1,
  slightly_smaller: -1,
  true_to_size: 0,
  true: 0,
  slightly_larger: 1,
  runs_large: 1,
  much_larger: 2,
};

function clampFit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(FIT_MAX, Math.max(FIT_MIN, Math.round(n)));
}

function fromLabel(label: string): number | null {
  const key = label.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return key in FIT_ALIASES ? FIT_ALIASES[key] : null;
}

/**
 * Parse the `custom.review` metafield value (a JSON string) into a fit value.
 * `undefined`/invalid input yields 0 — the marker rests at True To Size.
 */
export function parseFitScale(json: string | undefined | null): number {
  if (!json) return 0;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return 0;
  }
  const raw =
    data != null && typeof data === 'object' && 'fit' in data
      ? (data as { fit: unknown }).fit
      : data;
  if (typeof raw === 'number') return clampFit(raw);
  if (typeof raw === 'string') {
    const asNumber = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(asNumber)) return clampFit(asNumber);
    const aliased = fromLabel(raw);
    if (aliased != null) return aliased;
  }
  return 0;
}

/** Human label for a fit value ("On average, customers say it fits X"). */
export function fitLabel(fit: number): string {
  return FIT_LABELS[clampFit(fit)];
}

/** Marker position as a 0–100 percentage along the track. */
export function fitMarkerPercent(fit: number): number {
  return ((clampFit(fit) - FIT_MIN) / (FIT_MAX - FIT_MIN)) * 100;
}
