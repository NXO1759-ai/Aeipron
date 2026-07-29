'use client';

// ---------------------------------------------------------------------------
// useTweenedNumber — animates a number from its current displayed value to
// the next target with requestAnimationFrame + easeOutQuint (the same easing
// as the size selector's sliding marker, so the numbers and the marker glide
// together like one instrument). Re-targets cleanly mid-flight: a new target
// tweens FROM the number on screen at that moment.
//
// Display discipline: mid-flight frames count in WHOLE units — the count
// up/down reads 24 → 25 → 26 → 27, smooth and legible. Only the SETTLED
// frame shows the exact target, so a half value (27½) ever appears only when
// it is the actual measurement of the selected size — never as intermediate
// flicker between sizes.
//
// `null` target renders null (the caller shows a placeholder) and appears /
// disappears instantly — no tween. Under prefers-reduced-motion the value
// snaps to the target on the next frame.
//
// State discipline (react-hooks/set-state-in-effect): null transitions are
// adjusted during render (the documented prev-check pattern); tweens only
// ever set state inside rAF callbacks.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

/** easeOutQuint — identical to cubic-bezier(0.22, 1, 0.36, 1). */
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

export function useTweenedNumber(target: number | null, duration = 300): number | null {
  const [display, setDisplay] = useState<number | null>(target);
  const displayRef = useRef<number | null>(target);
  const [lastTarget, setLastTarget] = useState<number | null>(target);

  // Render-phase adjustment (React docs: "adjusting state when a prop
  // changes"): null transitions skip the tween entirely. Refs can't be
  // written during render, so displayRef catches up in the effect below.
  if (lastTarget !== target) {
    setLastTarget(target);
    if (target === null || lastTarget === null) {
      setDisplay(target);
    }
  }

  useEffect(() => {
    if (target === null) {
      displayRef.current = null;
      return;
    }
    const from = displayRef.current;
    if (from === null || from === target) {
      // Catch up with a render-phase set (null → value) or rest at the target.
      displayRef.current = target;
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const snap = requestAnimationFrame(() => {
        displayRef.current = target;
        setDisplay(target);
      });
      return () => cancelAnimationFrame(snap);
    }

    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Whole-unit counting mid-flight; the exact target (halves included)
      // only ever appears on the settled frame.
      const value =
        t >= 1 ? target : Math.round(from + (target - from) * easeOutQuint(t));
      displayRef.current = value;
      setDisplay(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return display;
}
