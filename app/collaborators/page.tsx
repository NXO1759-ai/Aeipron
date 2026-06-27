import { OrganizerCard } from './OrganizerCard';
import { getOrganizerSummaries } from '@/lib/catalog';

export default function CollaboratorsDirectory() {
  const organizers = getOrganizerSummaries();

  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-16 border-b border-ui-concrete/20 pb-8 pt-8">
          <h1 className="font-inter text-4xl md:text-6xl font-medium uppercase tracking-tighter mb-4 text-apeiron-ivory">Partners</h1>
          <p className="text-ui-concrete tracking-widest uppercase text-sm max-w-2xl leading-relaxed">
            We partner with visionary international concert organizers to engineer exclusive merchandise capsules that transcend the traditional tour souvenir. Explore our curated experiential retail destinations, designed to elevate live music into a seamless extension of your everyday uniform.
          </p>
        </div>

        {/* Card Collection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
          {organizers.map((org) => (
            <OrganizerCard key={org.id} org={org} />
          ))}
        </div>
      </div>
    </div>
  );
}
