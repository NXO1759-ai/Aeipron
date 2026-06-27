import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="min-h-screen bg-primary-obsidian text-primary-cream flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold uppercase tracking-[0.2em] mb-6">Product not found</h1>
      <p className="text-ui-concrete uppercase tracking-widest text-sm mb-10">This piece isn’t part of the current collection.</p>
      <Link href="/collection" className="border border-primary-cream px-10 py-4 uppercase tracking-widest font-bold text-sm hover:bg-primary-cream hover:text-primary-obsidian transition-colors">
        View the collection
      </Link>
    </div>
  );
}
