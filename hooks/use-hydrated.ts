'use client';

import { useEffect, useState } from 'react';

/**
 * Returns false on the server and on the first client render, then true after
 * mount. Use it to gate any UI that depends on persisted client state (the
 * cart) so the first client paint matches the server HTML and React doesn't
 * throw a hydration mismatch.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
