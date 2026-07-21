// ---------------------------------------------------------------------------
// Size selector (lib/size-selector) — pure keyboard-navigation helpers for
// the sliding-marker size selector (components/SizeSelector.tsx).
//
// The contract under test: given the size list, the sold-out set and the
// current index, arrow-key navigation always lands on an ENABLED size,
// skipping sold-out runs and wrapping around both ends; Home/End jump to the
// first/last enabled size. When every size is sold out, navigation is a no-op
// (returns the current index) and first/last resolve to -1 (nothing to focus).
//
// Pure module (no React, no DOM): fully unit-testable in the node env.
// ---------------------------------------------------------------------------

/** Indexes of sizes that are NOT sold out, in ascending order. */
export function enabledIndexes(sizes: readonly string[], soldOut: readonly string[] = []): number[] {
  const sold = new Set(soldOut);
  const out: number[] = [];
  for (let i = 0; i < sizes.length; i++) {
    if (!sold.has(sizes[i])) out.push(i);
  }
  return out;
}

/** Index of the first enabled size, or -1 when every size is sold out. */
export function firstEnabledIndex(sizes: readonly string[], soldOut: readonly string[] = []): number {
  return enabledIndexes(sizes, soldOut)[0] ?? -1;
}

/** Index of the last enabled size, or -1 when every size is sold out. */
export function lastEnabledIndex(sizes: readonly string[], soldOut: readonly string[] = []): number {
  const enabled = enabledIndexes(sizes, soldOut);
  return enabled[enabled.length - 1] ?? -1;
}

/**
 * Move `delta` steps (sign only matters) from `current` through the ENABLED
 * sizes, wrapping around both ends. A `current` that is -1 or sold out starts
 * from the first (forward) or last (backward) enabled size. Returns `current`
 * unchanged when there is nothing enabled to move to.
 */
export function nextEnabledIndex(
  sizes: readonly string[],
  soldOut: readonly string[],
  current: number,
  delta: number,
): number {
  const enabled = enabledIndexes(sizes, soldOut);
  if (enabled.length === 0) return current;
  const position = enabled.indexOf(current);
  if (position === -1) return delta >= 0 ? enabled[0] : enabled[enabled.length - 1];
  const nextPosition = (position + (delta >= 0 ? 1 : -1) + enabled.length) % enabled.length;
  return enabled[nextPosition];
}
