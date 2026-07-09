import Link from 'next/link';

export default function CollectionNotFound() {
  return (
    <div className="min-h-screen bg-apeiron-black text-apeiron-ivory flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold uppercase tracking-[0.2em] mb-6">Collection not found</h1>
      <p className="text-ui-concrete uppercase tracking-widest text-sm mb-10">
        This collection doesn’t exist.
      </p>
      <Link
        href="/collection"
        className="border border-apeiron-ivory px-10 py-4 uppercase tracking-widest font-bold text-sm hover:bg-apeiron-ivory hover:text-apeiron-black transition-colors"
      >
        View all collections
      </Link>
    </div>
  );
}