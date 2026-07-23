'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

// ---------------------------------------------------------------------------
// Home — the editorial chapter scroll.
//
// A one-category brand can't fill the page with collection tiles, so the page
// goes DEEP instead of wide: the hero garment told in chapters — fabric,
// construction, fit — ending on the buy action. Copy is grounded in /story
// ("beyond the trend", "infrastructure for your day", "quiet confidence").
//
// Imagery: /home/*.jpg in public/. Photography is uploaded to the repo
// directly (binary) — see the PR for the one-time upload step.
//
// Motion follows the storefront's discipline: whileInView fade/rise once per
// section (the same variant as /story), a subtle scroll parallax + settle
// zoom on the hero only, everything compositor-only (transform/opacity) and
// disabled under prefers-reduced-motion. The footer renders on home now
// (LayoutWrapper), so the page ends in standard chrome.
// ---------------------------------------------------------------------------

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: [0.25, 1, 0.5, 1] as const },
  },
};

type Chapter = {
  eyebrow: string;
  headline: string;
  copy: string;
  image: string;
  alt: string;
  /** Desktop: image sits on the right of the text. Mobile always stacks image first. */
  imageRight: boolean;
};

const CHAPTERS: Chapter[] = [
  {
    eyebrow: '01 / The Fabric',
    headline: 'Drapes like tailoring. Wears like Sunday.',
    copy: 'Our loopback terry is custom-milled: heavyweight, dense, and brushed once — never again. It softens with wear instead of pilling, and holds its line through every wash.',
    image: '/home/fabric.jpg',
    alt: 'Macro photograph of black heavyweight loopback terry, knit loops visible in raking light',
    imageRight: true,
  },
  {
    eyebrow: '02 / The Construction',
    headline: 'Built, not assembled.',
    copy: 'French seams throughout. Double-ribbed cuffs that recover their shape. Branding debossed, never printed. If a detail doesn\u2019t make the garment last longer or fit better, it doesn\u2019t make the cut.',
    image: '/home/construction.jpg',
    alt: 'Macro photograph of a french seam and double-ribbed cuff on a black heavyweight hoodie',
    imageRight: false,
  },
  {
    eyebrow: '03 / The Fit',
    headline: 'Structure you can live in.',
    copy: 'Boxy through the body with a structured shoulder, so it reads tailored at a distance and feels like leisure up close. It moves with you and holds its shape — infrastructure for your day.',
    image: '/home/fit.jpg',
    alt: 'Hooded figure against a dark concrete wall, showing the boxy structured fit of the black hoodie',
    imageRight: true,
  },
];

function ChapterSection({ chapter }: { chapter: Chapter }) {
  return (
    <section className="border-t border-ui-concrete/20">
      <div className="grid md:grid-cols-2">
        <div
          className={`relative aspect-[4/5] md:aspect-auto md:min-h-[85vh] overflow-hidden ${
            chapter.imageRight ? 'md:order-2' : ''
          }`}
        >
          <Image
            src={chapter.image}
            alt={chapter.alt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover contrast-125 brightness-75"
          />
        </div>
        <div className="flex flex-col justify-center px-6 md:px-12 lg:px-20 py-16 md:py-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={fadeUp}
            className="max-w-md"
          >
            <p className="text-xs uppercase tracking-widest text-ui-concrete mb-6">{chapter.eyebrow}</p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold uppercase tracking-tighter mb-8">
              {chapter.headline}
            </h2>
            <p className="text-sm md:text-base text-ui-concrete leading-relaxed">{chapter.copy}</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  // Hero parallax: the background drifts up slightly as the page scrolls away.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '12%']);

  return (
    <div className="flex flex-col min-h-screen bg-apeiron-black text-apeiron-ivory">
      {/* Chapter 00: Hero — lvh, NOT dvh: dvh resizes live when the mobile
          browser chrome collapses on scroll, reflowing the whole hero (and
          its filtered image) mid-gesture — a visible hitch at scroll start.
          lvh stays constant, so the first swipe is pure compositor work. */}
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

      {/* Chapters 01–03: fabric, construction, fit */}
      {CHAPTERS.map((chapter) => (
        <ChapterSection key={chapter.eyebrow} chapter={chapter} />
      ))}

      {/* Chapter 04: the first chapter — the hoodie, with the buy action */}
      <section className="border-t border-ui-concrete/20 px-6 md:px-12 py-24 md:py-32">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={fadeUp}
          className="max-w-md mx-auto flex flex-col items-center text-center"
        >
          <p className="text-xs uppercase tracking-widest text-ui-concrete mb-6">04 / The First Chapter</p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold uppercase tracking-tighter mb-8">
            We start with the hoodie.
          </h2>
          <p className="text-sm md:text-base text-ui-concrete leading-relaxed mb-12">
            One garment, done properly, before anything else. Custom-milled heavyweight loopback
            terry, shipped from New York.
          </p>

          <Link href="/product/hoodie" className="group block w-full">
            <div className="relative aspect-square overflow-hidden border border-ui-concrete/20">
              <Image
                src="/home/product.jpg"
                alt="The black heavyweight Apeiron hoodie, folded flat on dark slate"
                fill
                sizes="(min-width: 768px) 28rem, 100vw"
                className="object-cover motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out group-hover:scale-[1.03]"
              />
            </div>
            <div className="mt-4 flex items-center justify-between uppercase tracking-widest text-sm font-bold">
              <span>The Heavyweight Hoodie</span>
              <span aria-hidden="true" className="text-ui-concrete group-hover:text-apeiron-ivory transition-colors">
                →
              </span>
            </div>
          </Link>

          <Link
            href="/product/hoodie"
            className="mt-10 w-full bg-apeiron-ivory text-apeiron-black py-5 uppercase tracking-widest font-bold text-sm transition-all duration-[600ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:opacity-80 active:opacity-80"
          >
            Shop the Hoodie
          </Link>
          <Link
            href="/shop"
            className="mt-4 text-xs uppercase tracking-widest text-ui-concrete hover:text-apeiron-ivory active:text-apeiron-ivory transition-colors"
          >
            View everything
          </Link>
        </motion.div>
      </section>

      {/* Closing anchor */}
      <section className="border-t border-ui-concrete/20 px-6 py-24 md:py-40 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={fadeUp}
        >
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-medium uppercase tracking-tighter mb-12">
            Beyond
            <br />
            the trend.
          </h2>
          <Link
            href="/story"
            className="text-xs uppercase tracking-widest text-apeiron-ivory underline underline-offset-8 hover:text-accent-energy active:text-accent-energy transition-colors"
          >
            Read our story
          </Link>
        </motion.div>
      </section>
    </div>
  );
}
