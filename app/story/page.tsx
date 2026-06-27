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
            src="https://picsum.photos/seed/guitarheadstock/1920/1080"
            alt="Cinematic macro shot of a guitar headstock"
            fill
            priority
            className="object-cover filter contrast-125 brightness-[0.6] grayscale"
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
              AEIPRON
            </h1>
            <div className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-[0.4em] text-[#FF2A5F] ml-2">
              アペイロン
            </div>
          </div>
          <p className="text-lg md:text-2xl font-light leading-relaxed text-neutral-400 max-w-2xl mx-auto">
            Apeiron was born from a singular vision: to erase the boundary between structural luxury and everyday ease. We design for the limitless—those who demand absolute mastery in every layer of their uniform.
          </p>
        </motion.div>
      </section>

      {/* Section 2: The Origin (Split-Pane Layout) */}
      <section className="px-4 md:px-12 py-24 md:py-32 border-t border-neutral-800">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24 items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUpVariant}
          >
            <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-widest mb-8 text-[#fdfcf0]">
              Beyond The Expected.
            </h2>
            <p className="text-base md:text-lg font-light leading-relaxed text-neutral-400">
              The concept was forged out of a deep frustration with the modern wardrobe. We saw a landscape divided between rigid, uncomfortable tailoring and uninspired leisurewear. Apeiron bridges that gap, offering a seamless integration of high-density textures and architectural silhouettes designed to move with you.
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
              src="https://picsum.photos/seed/storyorigin/1200/1600" 
              alt="16mm cinematic macro-shot of a garment" 
              fill 
              className="object-cover filter contrast-125 brightness-75 grayscale"
            />
          </motion.div>
        </div>
      </section>

      {/* Section 3: The Craftsmanship (Text-Heavy / Editorial Block) */}
      <section className="px-4 py-24 md:py-48 border-t border-neutral-800">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeUpVariant}
          className="max-w-3xl md:max-w-4xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-5xl font-bold uppercase tracking-widest mb-8 text-[#fdfcf0]">
            Obsessive Engineering.
          </h2>
          <p className="text-lg md:text-2xl font-light leading-relaxed text-neutral-400">
            True confidence is built from the thread up. We source exclusively from the world’s most revered mills, utilizing custom heavyweight Japanese loopback terry and hyper-durable textiles. Every French seam, blind-debossed detail, and structural fold is meticulously calibrated for longevity and form.
          </p>
        </motion.div>
      </section>

      {/* Section 4: The Philosophy (Footer/Closing Anchor) */}
      <section className="px-4 py-24 md:py-32 border-t border-neutral-800 flex flex-col items-center text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={fadeUpVariant}
          className="max-w-4xl mx-auto"
        >
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold uppercase tracking-widest mb-12 text-[#fdfcf0] leading-tight">
            Quiet Confidence.<br />Everyday Mastery.
          </h2>
          <p className="text-base md:text-xl font-light leading-relaxed text-neutral-400 max-w-2xl mx-auto">
            Our garments are not designed to shout; they are engineered to perform. We create foundational pieces for visionaries, creators, and leaders who require their wardrobe to be as uncompromising as their ambitions. This is your canvas for limitless potential.
          </p>
        </motion.div>
      </section>
    </div>
  );
}
