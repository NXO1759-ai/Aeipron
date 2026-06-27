import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-apeiron-black">
      {/* Hero Section */}
      <section className="relative h-[100dvh] w-full flex items-center justify-center overflow-hidden bg-apeiron-black">
        {/* Cinematic Background */}
        <div className="absolute inset-0 w-full h-full">
          <div className="absolute inset-0 bg-apeiron-black/40 z-10" />
          <Image 
            src="https://picsum.photos/seed/terrycloth/1920/1080"
            alt="Macro photography of custom-milled heavyweight black Japanese loopback terry"
            fill
            priority
            className="object-cover filter contrast-125 brightness-[0.6]"
          />
        </div>

        <div className="relative z-20 flex flex-col items-center text-center px-4 w-full">
          <h1 className="font-inter text-5xl md:text-7xl lg:text-9xl font-medium text-apeiron-ivory uppercase tracking-tighter mb-12 drop-shadow-2xl">
            Everyday Mastery
          </h1>
          <Link 
            href="/collection" 
            className="bg-transparent border border-apeiron-ivory text-apeiron-ivory px-12 py-5 uppercase tracking-widest font-bold text-sm transition-all duration-[600ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:bg-apeiron-ivory hover:text-apeiron-black"
          >
            Explore The Core
          </Link>
        </div>
      </section>
    </div>
  );
}
