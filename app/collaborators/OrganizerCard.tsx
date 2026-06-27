import Link from 'next/link';
import Image from 'next/image';

interface OrganizerSummary {
  id: string;
  name: string;
  image: string;
}

export function OrganizerCard({ org }: { org: OrganizerSummary }) {
  return (
    <Link href={`/collaborators/${org.id}`} className="group cursor-pointer">
      <div className="relative aspect-[3/4] bg-ui-concrete/10 mb-4 overflow-hidden">
        <Image
          src={org.image}
          alt={org.name}
          fill
          className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-105 filter grayscale contrast-125"
        />
        <div className="absolute inset-0 bg-apeiron-black/0 group-hover:bg-apeiron-black/20 transition-colors duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]" />
      </div>
      <div className="flex justify-between items-start mt-4">
        <h3 className="font-bold uppercase tracking-wider text-sm leading-tight max-w-[75%] text-ui-concrete group-hover:text-apeiron-ivory transition-colors duration-300">
          {org.name}
        </h3>
      </div>
    </Link>
  );
}
