'use client';

// ---------------------------------------------------------------------------
// FadeIn — the storefront's standard scroll-reveal as a tiny client island.
//
// Extracted so server components (home, and any future editorial page) can
// keep their markup server-rendered while only this wrapper hydrates. Motion
// discipline is unchanged: whileInView once per mount, compositor-only
// (transform/opacity), same easing as /story.
// ---------------------------------------------------------------------------

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: [0.25, 1, 0.5, 1] as const },
  },
};

export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
      variants={fadeUp}
      className={className}
    >
      {children}
    </motion.div>
  );
}
