'use client';

import { motion } from 'motion/react';
import Image from 'next/image';

export default function StoryPage() {
  const fadeUpVariant = {
    hidden: { opacity: 0, y: 16 },
    visible: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: 1, ease: [0.25, 1, 0.5, 1] as const } 
    }
  };

  return (
    <div className="bg-[#0a0a0a] min-h-screen text-[#fdfcf0] font-inter selection:bg-[#fdfcf0] selection:text-[#0a0a0a]">
      {/* Section 1: The Hero Statement */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 py-24 md:py-32 overflow-hidden">
        {/* Cinematic Background */}
        <div className="absolute inset-0 w-full h-full z-0">
          <div className="absolute inset-0 bg-[#0a0a0a]/60 z-10" />
          <Image 
            src="/home/hero.jpg"
            alt="Macro photograph of the hood and drawstrings of a black heavyweight loopback terry hoodie"
            fill
            priority
            className="object-cover contrast-125 brightness-[0.6]"
          />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeUpVariant}
          className="relative z-20 max-w-4xl mx-auto"
        >
          <div className="flex flex-col items-center justify-center mb-12">
            <h1 className="text-5xl md:text-7xl lg:text-9xl font-bold uppercase tracking-[0.2em] text-[#fdfcf0] mb-4">
              APEIRON
            </h1>
            <div className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-[0.4em] text-[#FF2A5F] ml-2">
              アペイロン
            </div>
          </div>
          <p className="text-lg md:text-2xl font-light leading-relaxed text-neutral-400 max-w-2xl mx-auto">
            Apeiron is Greek for &ldquo;without limit.&rdquo; We make everyday apparel, built to outlast the trend cycle.
          </p>
        </motion.div>
      </section>

      {/* Section 2: The Origin (Split-Pane Layout) */}
      <section className="cv-auto px-4 md:px-12 py-24 md:py-32 border-t border-neutral-800">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24 items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUpVariant}
          >
            <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-widest mb-8 text-[#fdfcf0]">
              Beyond The Trend
            </h2>
            <p className="text-base md:text-lg font-light leading-relaxed text-neutral-400">
              You know the compromise. Tailoring that looks right and feels wrong. Leisure wear that feels right and looks like giving up. We started Apeiron to close that gap. Clothes with the structure of tailoring, cut from fabrics you can actually live in. They move with you, hold their shape, and outlast the season they were bought in. We don&apos;t really think of it as fashion. It&apos;s infrastructure for your day.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1.5, ease: [0.25, 1, 0.5, 1] }}
            className="relative aspect-[3/4] md:aspect-[4/5] bg-neutral-900 overflow-hidden"
          >
            <Image
              src="/home/fit.jpg"
              alt="Hooded figure against a dark concrete wall, showing the boxy structured fit of the black hoodie"
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover contrast-125 brightness-75"
            />
          </motion.div>
        </div>
      </section>

      {/* Section 3: The Craftsmanship (Text-Heavy / Editorial Block) */}
      <section className="cv-auto px-4 py-24 md:py-48 border-t border-neutral-800">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeUpVariant}
          className="max-w-3xl md:max-w-4xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-widest mb-8 text-[#fdfcf0]">
            Obsessive Engineering
          </h2>
          <p className="text-lg md:text-2xl font-light leading-relaxed text-neutral-400">
            Every decision starts with the fabric. Our loopback terry is custom-milled, heavyweight and dense, so it drapes like tailoring and softens with wear instead of pilling. French seams throughout. Branding debossed, never printed. If a detail doesn&apos;t make the garment last longer or fit better, it doesn&apos;t make the cut.
          </p>
        </motion.div>
      </section>

      {/* Section 4: The Philosophy (Footer/Closing Anchor) */}
      <section className="cv-auto px-4 py-24 md:py-32 border-t border-neutral-800 flex flex-col items-center text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={fadeUpVariant}
          className="max-w-4xl mx-auto"
        >
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold uppercase tracking-widest mb-12 text-[#fdfcf0] leading-tight">
            Quiet Confidence<br />Everyday Mastery
          </h2>
          <p className="text-base md:text-xl font-light leading-relaxed text-neutral-400 max-w-2xl mx-auto">
            We don&apos;t make clothes that announce themselves. Most of what we make is black, the branding is invisible from more than a few feet away, and none of it will look dated in ten years. The people who wear Apeiron have usually outgrown the trend cycle. They want a wardrobe as considered as the rest of their life. The people who notice these things will notice. Everyone else will just think you look put together. That&apos;s the whole idea.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
