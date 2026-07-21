import { FIT_TICKS, fitLabel, fitMarkerPercent } from '@/lib/fit';

// ---------------------------------------------------------------------------
// FitScale — the "Smaller … True To Size … Larger" fit indicator shown inside
// the Reviews disclosure. Purely presentational (no client directive): the
// marker position is derived from the `fit` prop (-2..+2), so upgrading from
// a static marker to a sliding, review-driven scale later is only a data
// change — the marker's `left` already transitions smoothly.
// ---------------------------------------------------------------------------

export function FitScale({ fit }: { fit: number }) {
  const label = fitLabel(fit);
  const percent = fitMarkerPercent(fit);

  return (
    <div role="img" aria-label={`On average, customers say it fits ${label}`}>
      <p className="text-sm text-ui-concrete mb-5">
        On average, customers say it fits <span className="font-bold text-primary-cream">{label}</span>
      </p>

      {/* Track + ticks + marker */}
      <div className="relative h-2 mx-1">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ui-concrete/50" aria-hidden="true" />
        {FIT_TICKS.map((tick) => (
          <span
            key={tick}
            aria-hidden="true"
            className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-ui-concrete/60"
            style={{ left: `${((tick + 2) / 4) * 100}%` }}
          />
        ))}
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-cream transition-[left] duration-300 ease-out"
          style={{ left: `${percent}%` }}
        />
      </div>

      {/* End + centre labels */}
      <div className="relative mt-3 h-4 text-xs uppercase tracking-widest text-ui-concrete" aria-hidden="true">
        <span className="absolute left-0">Smaller</span>
        <span className="absolute left-1/2 -translate-x-1/2">True To Size</span>
        <span className="absolute right-0">Larger</span>
      </div>
    </div>
  );
}
