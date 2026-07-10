'use client';

import { useSyncExternalStore } from 'react';

/**
 * Returns false on the server and on the first client render, then true after
 * mount. Use it to gate any UI that depends on persisted client state (the
 * cart) so the first client paint matches the server HTML and React doesn't
 * throw a hydration mismatch.
 *
 * Implemented with `useSyncExternalStore`: the server snapshot is `false`, the
 * client snapshot is `true`. This yields the same "hydrated?" semantics as the
 * old `useState(false) + useEffect(() => setHydrated(true))` pattern WITHOUT a
 * synchronous setState in an effect (which `react-hooks/set-state-in-effect`
 * flags as a cascading-render risk and which `eslint .` enforces).
 */
const emptySubscribe = (): (() => void) => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
