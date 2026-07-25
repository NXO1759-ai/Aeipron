'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// useCoarsePointer — true on touch-first devices (matchMedia '(pointer: coarse)').
//
// This is the "weak GPU + touch scrolling" signal: scroll-linked effects that
// cost a full-viewport repaint per frame (e.g. the home hero parallax over a
// CSS-filtered image) opt OUT on coarse pointers, where that paint cost turns
// directly into scroll jank. SSR/first render returns false, so the effect
// renders once and then disables after hydration — at scrollY = 0 the
// parallax offset is 0, so nothing visibly jumps.
// ---------------------------------------------------------------------------

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return coarse;
}
