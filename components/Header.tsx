"use client";

import Link from "next/link";
import { Menu, X, ShoppingBag } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import { useCart } from "@/store/use-cart";
import { useHydrated } from "@/hooks/use-hydrated";
import { protectionQuantityOf } from "@/lib/protection";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

  // The editorial home page scrolls now: the header starts transparent over
  // the hero, then turns opaque once the hero has scrolled away — otherwise
  // the fixed wordmark floats over chapter text mid-scroll. A boolean flip
  // only (no per-frame work; unchanged state values bail out of rendering).
  const [solidOnHome, setSolidOnHome] = useState(false);
  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setSolidOnHome(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);
  const headerSolid = !isHome || solidOnHome;

  const { items, totalQuantity, toggleCart } = useCart();
  const hydrated = useHydrated();
  // The badge reads the store's `totalQuantity` (sourced from Shopify's
  // cart.totalQuantity) MINUS any protection lines — Navidium's product is
  // not merchandise and never inflates the count. Gated behind `useHydrated`
  // so the first client paint matches the server HTML (empty).
  const itemCount = hydrated ? totalQuantity - protectionQuantityOf(items) : 0;

  // Collaborators is intentionally absent from the nav list (per client
  // direction). The /collaborators route + components are kept on disk for
  // future reuse — only the nav entry is removed. Re-add the line below to
  // surface it again: { label: "Collaborators", href: "/collaborators" },
  // Collection is likewise hidden from the nav (replaced by Shop) — the
  // /collection routes stay on disk for re-enabling when more collections exist.
  const navLinks = [
    { label: "Shop", href: "/shop" },
    { label: "Our Story", href: "/story" },
    { label: "Help Center", href: "/help" },
  ];

  return (
    <>
      <header
        // OPAQUE (not translucent + backdrop-blur). `backdrop-filter: blur()` on a
        // position:fixed element is the classic site-wide scroll-jank cause —
        // the browser re-rasterizes the blurred backdrop every scroll frame.
        // In this dark theme an opaque bar is visually near-identical to the
        // old 70%-black + blur, but composites a single layer with no per-frame
        // filter cost. Home starts transparent over the hero and flips opaque
        // (border kept always-on so the flip causes no layout shift).
        className={`fixed top-0 w-full z-40 transition-colors duration-300 border-b ${headerSolid ? "bg-apeiron-black border-ui-concrete/10" : "bg-transparent border-transparent"}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-24 flex items-center justify-between">
          {/* Left Hemisphere: Brand Lockup */}
          <Link
            href="/"
            className="flex flex-col items-start cursor-pointer group"
          >
            <h1 className="text-2xl font-bold uppercase tracking-[0.2em] text-apeiron-ivory leading-none">
              Apeiron
            </h1>
            <span className="text-[10px] text-apeiron-ivory tracking-[0.3em] mt-1 leading-none font-medium">
              アペイロン
            </span>
          </Link>

          {/* Right Hemisphere: Bag + Menu Toggle */}
          <div className="flex items-center gap-6">
            <button
              onClick={toggleCart}
              aria-label={`Open bag${itemCount > 0 ? `, ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""}`}
              className="relative text-apeiron-ivory transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-105 flex items-center justify-center"
            >
              <ShoppingBag className="w-7 h-7 stroke-[1.5]" />
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-accent-energy text-apeiron-black text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {itemCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsMenuOpen(true)}
              aria-label="Open menu"
              className="text-apeiron-ivory transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-105 flex items-center justify-center"
            >
              <Menu className="w-8 h-8 stroke-[1.5]" />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 z-50 bg-apeiron-black/85"
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "tween",
                duration: 0.5,
                ease: [0.25, 1, 0.5, 1],
              }}
              className="fixed top-0 right-0 z-50 flex h-full w-full max-w-sm flex-col bg-apeiron-black border-l border-ui-concrete/20"
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
            >
              <div className="flex items-center justify-between p-6 h-24 border-b border-ui-concrete/20">
                <div className="flex flex-col items-start">
                  <span className="text-xl font-bold uppercase tracking-[0.2em] text-apeiron-ivory leading-none">
                    Apeiron
                  </span>
                  <span className="text-[10px] text-apeiron-ivory tracking-[0.3em] mt-1 leading-none">
                    アペイロン
                  </span>
                </div>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  aria-label="Close menu"
                  className="text-ui-concrete hover:text-apeiron-ivory transition-colors"
                >
                  <X className="w-8 h-8 stroke-[1.5]" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-8 flex flex-col gap-10 mt-8">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="font-inter text-2xl font-medium uppercase tracking-widest text-ui-concrete hover:text-apeiron-ivory transition-colors duration-300"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
