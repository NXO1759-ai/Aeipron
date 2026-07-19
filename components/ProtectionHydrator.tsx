'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '@/store/use-cart';
import { getProtectionConfig } from '@/app/cart/actions';

// ---------------------------------------------------------------------------
// ProtectionHydrator — a zero-render client island that is the always-mounted
// engine for Captain shipping protection.
//
// Two responsibilities:
//   1. Load the protection config once on mount (available fee-tier variants +
//      the merchant's percentage rate) and push it into the cart store via
//      `setProtectionConfig`. `getProtectionConfig` is a server action that
//      ships ONLY plain variant data + the rate — no token, no cart id, no
//      Shopify raw shapes. When the product is not visible to the Storefront API
//      (not published / UNLISTED) it returns null and the config is cleared, so
//      the toggle renders nothing (graceful degrade).
//   2. Re-run `reconcileProtectionVariant` whenever the cart items change so the
//      fee tier is swapped automatically when a subtotal change crosses a tier
//      boundary (e.g. the buyer changes a quantity). The store guards that call
//      to idle state only, so it never races an in-flight add/remove. This lives
//      here (not in the toggle) so it keeps running even when the toggle is
//      hidden/unmounted — e.g. when protection is ON (the toggle renders nothing
//      and the ProtectionLineItem row is the visible representation).
//
// LayoutWrapper persists across client-side navigations, so the config load is
// one call per page session. Mirrors CartHydrator's once-per-mount pattern.
// ---------------------------------------------------------------------------

export function ProtectionHydrator() {
  const didRun = useRef(false);
  const items = useCart((s) => s.items);
  const variants = useCart((s) => s.protectionVariants);
  const reconcile = useCart((s) => s.reconcileProtectionVariant);
  const autoDisable = useCart((s) => s.autoDisableProtectionIfEmpty);

  // (1) Load protection config once on mount.
  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    let cancelled = false;
    getProtectionConfig()
      .then((cfg) => {
        if (!cancelled) useCart.getState().setProtectionConfig(cfg);
      })
      .catch(() => {
        // Non-fatal: leave the config empty → the toggle simply doesn't render.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // (2) Re-swap the tier when the cart changes. The store no-ops unless
  // protection is on, the tier differs, and no other mutation is in flight.
  useEffect(() => {
    void reconcile();
  }, [items, reconcile]);

  // (3) Safety net: if the cart ends up with protection on but no merchandise
  // (e.g. an orphan persisted from a prior session, surfaced once the config
  // loads on mount), turn protection off so the cart shows empty. The store
  // no-ops unless protection is on, merchandise is 0, and no mutation is pending.
  useEffect(() => {
    void autoDisable();
  }, [items, variants, autoDisable]);

  return null;
}