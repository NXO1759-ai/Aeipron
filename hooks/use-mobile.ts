import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Subscribes to the viewport via matchMedia. Module-level so the subscribe
// function is referentially stable (no resubscribe churn between renders).
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

// Server snapshot: render as non-mobile (matches the previous implementation,
// which also resolved to false before hydration).
function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  // useSyncExternalStore instead of useState + effect: reading external
  // (browser) state with a synchronous setState inside an effect triggers
  // cascading renders and is rejected by react-hooks/set-state-in-effect.
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
