import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getOrganizer } from '@/lib/catalog';
import { QuickAddProductCard } from './QuickAddProductCard';

export default async function OrganizerMerchPage({ params }: { params: Promise<{ organizerId: string }> }) {
  const { organizerId } = await params;

  // Resolve the organizer; unknown ids hit the 404 boundary rather than
  // silently rendering a placeholder partner.
  const organizer = getOrganizer(organizerId);
  if (!organizer) notFound();

  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory">
      {/* Co-Branded Hero */}
      <section className="relative h-[60vh] w-full overflow-hidden">
        <Image
          src={organizer.heroImage}
          alt={`${organizer.name} concert`}
          fill
          className="object-cover contrast-125 brightness-75"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-10">
          <h1 className="font-inter text-4xl md:text-6xl lg:text-8xl font-medium uppercase tracking-tighter mb-2 text-apeiron-ivory">
            Apeiron
          </h1>
          <div className="text-2xl md:text-4xl text-ui-concrete tracking-[0.2em] uppercase">
            x {organizer.name}
          </div>
        </div>
      </section>

      {/* Chaotic Layout Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Lifestyle Column */}
          <div className="md:col-span-5 space-y-8 md:sticky md:top-24">
            <div className="relative aspect-[4/5] bg-ui-concrete/10">
              <Image src="https://picsum.photos/seed/chaotic1/800/1000" alt="Lifestyle 1" fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" />
            </div>
            <div className="relative aspect-video bg-ui-concrete/10 hidden md:block">
              <Image src="https://picsum.photos/seed/chaotic2/1000/562" alt="Lifestyle 2" fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover contrast-150" />
            </div>
          </div>

          {/* Stark Product Grid Column */}
          <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {organizer.merch.map((item) => (
              <QuickAddProductCard key={item.id} product={item} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
