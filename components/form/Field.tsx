'use client';

import { forwardRef } from 'react';
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Form field primitives (Phase 4b — custom checkout).
//
// The first form controls in the repo, built for the dark checkout theme and
// accessible by default:
//   - `Field`      — label + control + error wrapper. Wires `aria-invalid` and
//                   `aria-describedby` to the control via a render-prop so the
//                   error message is announced to assistive tech.
//   - `Input`     — a styled `<input>` (forwardRef → react-hook-form register).
//   - `Select`    — a styled `<select>` (forwardRef → register).
//   - `FieldError`— the live error text (`role="alert"`).
//
// These carry NO business logic and import nothing server-only — safe to use
// from any 'use client' component (checkout today; My Account later). The
// shared class strings are exported so unrelated styled inputs can reuse the
// look without re-declaring it.
// ---------------------------------------------------------------------------

/** Shared visual treatment for text inputs + selects on the dark theme. */
export const fieldBaseClass =
  'w-full bg-apeiron-black border border-ui-concrete/30 px-4 py-3 ' +
  'text-primary-cream placeholder:text-ui-concrete/60 ' +
  'focus:outline-none focus:border-primary-cream transition-colors ' +
  'disabled:opacity-60';

/** Error-state modifier applied on top of `fieldBaseClass`. */
const fieldErrorClass = 'border-accent-energy focus:border-accent-energy';

/** Props returned by `Field`'s render-prop — spread onto the control element. */
export interface FieldAriaProps {
  /** Stable id matching the <label htmlFor> + the error element id. */
  id: string;
  /** `true` when this field has a validation error (drives `aria-invalid`). */
  'aria-invalid': boolean;
  /** Points at the error message id, so screen readers announce it. */
  'aria-describedby'?: string;
}

interface FieldProps {
  /** The visible label text. */
  label: string;
  /** The field name — used to derive the control id + error id. */
  name: string;
  /** The validation error message (from react-hook-form `formState.errors`). */
  error?: string;
  /** Whether the field is required (adds a visual `*` marker; does NOT set
   *  `required` on the control — react-hook-form owns validation). */
  required?: boolean;
  /** Optional hint shown above the input (e.g. "2-letter state code"). */
  hint?: string;
  /**
   * Render prop: receives the aria props to spread onto the control. Using a
   * render prop (instead of children) lets `Field` own the label/error wiring
   * while the consumer keeps full control of the `<input>`/`<select>` + its
   * `register(...)` spread.
   */
  children: (aria: FieldAriaProps) => ReactNode;
}

/**
 * Label + control + error wrapper. Renders the label (with a `*` when
 * required), calls `children` with the aria props the control must carry, and
 * renders a live `FieldError` beneath when `error` is set.
 */
export function Field({ label, name, error, required, hint, children }: FieldProps) {
  const id = name;
  const errorId = `${name}-error`;
  const aria: FieldAriaProps = {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? errorId : undefined,
  };

  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className="block text-xs uppercase tracking-widest font-bold text-primary-cream mb-2"
      >
        {label}
        {required ? <span className="text-accent-energy ml-1" aria-hidden="true">*</span> : null}
      </label>
      {children(aria)}
      {hint && !error ? (
        <p className="mt-2 text-xs text-ui-concrete">{hint}</p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/** The live error text shown beneath a field. `role="alert"` so it is announced. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-2 text-xs uppercase tracking-widest font-bold text-accent-energy"
    >
      {children}
    </p>
  );
}

/** A dark-themed text input. forwardRef so react-hook-form's `register` works. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';
    return (
      <input
        ref={ref}
        className={cn(fieldBaseClass, invalid && fieldErrorClass, className)}
        {...props}
      />
    );
  },
);

/** A dark-themed select. forwardRef so react-hook-form's `register` works. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    const invalid = props['aria-invalid'] === true || props['aria-invalid'] === 'true';
    return (
      <select
        ref={ref}
        className={cn(fieldBaseClass, 'appearance-none', invalid && fieldErrorClass, className)}
        {...props}
      >
        {children}
      </select>
    );
  },
);