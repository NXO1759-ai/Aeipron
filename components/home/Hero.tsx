'use client';

// ---------------------------------------------------------------------------
// Home hero — the one genuinely interactive piece of the home page (scroll
// parallax + settle zoom), isolated as a client island so the rest of the
// page can be a server component. Behavior is byte-for-byte the pre-split
// hero: lvh (NOT dvh — see below), reduced-motion opt-out, compositor-only
// transforms, priority-loaded hero image.
// ---------------------------------------------------------------------------

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

import { fadeUp } from './FadeIn';

export function Hero() {
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  // Hero parallax: the background drifts up slightly as the page scrolls away.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '12%']);

  return (
    /* lvh, NOT dvh: dvh resizes live when the mobile browser chrome collapses
       on scroll, reflowing the whole hero (and its filtered image) mid-gesture
       — a visible hitch at scroll start. lvh stays constant, so the first
       swipe is pure compositor work. */
    <section
      ref={heroRef}
      className="relative h-[100lvh] w-full flex items-center justify-center overflow-hidden bg-apeiron-black"
    >
      <motion.div
        className="absolute inset-0 w-full h-full"
        style={reduceMotion ? undefined : { y: heroY }}
      >
        <div className="absolute inset-0 bg-apeiron-black/40 z-10" />
        <motion.div
          className="absolute inset-0"
          initial={reduceMotion ? undefined : { scale: 1.06 }}
          animate={reduceMotion ? undefined : { scale: 1 }}
          transition={{ duration: 2.4, ease: [0.25, 1, 0.5, 1] }}
        >
          <Image
            src="/home/hero.jpg"
            alt="Macro photograph of the hood and drawstrings of a black heavyweight loopback terry hoodie"
            fill
            priority
            sizes="100vw"
            className="object-cover contrast-125 brightness-[0.6]"
          />
        </motion.div>
      </motion.div>

      <div className="relative z-20 flex flex-col items-center text-center px-4 w-full">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="flex flex-col items-center"
        >
          <h1 className="font-inter text-5xl md:text-7xl lg:text-9xl font-medium text-apeiron-ivory uppercase tracking-tighter mb-6 drop-shadow-2xl">
            Everyday Mastery
          </h1>
          <p className="text-sm md:text-base text-apeiron-ivory/70 tracking-wide mb-12 max-w-md">
            Heavyweight essentials, built to outlast the trend cycle.
          </p>
          <Link
            href="/shop"
            className="bg-transparent border border-apeiron-ivory text-apeiron-ivory px-12 py-5 uppercase tracking-widest font-bold text-sm transition-all duration-[600ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-apeiron-ivory hover:text-apeiron-black active:bg-apeiron-ivory active:text-apeiron-black"
          >
            Explore The Core
          </Link>
        </motion.div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.3em] text-apeiron-ivory/60">Scroll</span>
        <span className="w-px h-10 bg-apeiron-ivory/40" aria-hidden="true" />
      </div>
    </section>
  );
}
