'use client';

// ---------------------------------------------------------------------------
// useDialogExit — gives a pop-up an exit animation before it unmounts.
//
// The dialog components (Reviews details, legal policies) render only while
// open, so a plain onClose would cut them off mid-frame. requestClose()
// instead flips `closing` (the dialog swaps its enter classes for the
// `.dialog-*-out` classes) and fires the real onClose after the outro
// duration — the same choreographed exit the mobile menu gets from
// AnimatePresence, without pulling an animation library into these dialogs.
//
// Under prefers-reduced-motion the outro classes are animation-less, so the
// close fires immediately. Repeat triggers (Esc mashing, backdrop double
// clicks) are no-ops — the timer is armed once.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep in sync with the .dialog-*-out durations in app/globals.css (160ms). */
export const DIALOG_EXIT_MS = 160;

export function useDialogExit(onClose: () => void): { closing: boolean; requestClose: () => void } {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  // If the dialog unmounts for any other reason first, don't fire late.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const requestClose = useCallback(() => {
    setClosing((alreadyClosing) => {
      if (alreadyClosing) return true; // timer already armed
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      timerRef.current = window.setTimeout(onClose, reduced ? 0 : DIALOG_EXIT_MS);
      return true;
    });
  }, [onClose]);

  return { closing, requestClose };
}
