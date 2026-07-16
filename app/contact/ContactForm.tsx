'use client';

// ---------------------------------------------------------------------------
// ContactForm — the /contact page's client island.
//
// A react-hook-form + zod form (name, email, optional phone, message). On
// submit it calls the `submitContactMessage` server action, which writes a
// `contact_message` metaobject to Shopify via the Admin API (the storefront
// `/contact` POST is blocked by Cloudflare + Shopify captcha for headless
// submissions — see app/contact/actions.ts). The message therefore lands in
// Shopify admin (and is emailed if the store has a Shopify Flow wired to the
// metaobject), while the form stays in our headless UI with an in-page
// success state.
//
// Reuses the dark-theme form primitives from components/form/Field.tsx (Field,
// Input) so the contact form looks identical to the checkout form. TRUST
// BOUNDARY: this component imports only the server action + the pure schema
// module (lib/contact-schema) — it never imports lib/shopify/* (server-only).
// The server action re-validates every payload before it reaches Shopify.
//
// The form is a client island inside the otherwise-static Server Component
// page, so /contact stays prerendered + indexable (no `force-dynamic`).
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contactFormSchema, type ContactForm } from '@/lib/contact-schema';
import { submitContactMessage } from '@/app/contact/actions';
import { Field, Input } from '@/components/form/Field';

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: '', email: '', phone: '', message: '' },
  });

  const onSubmit = async (data: ContactForm) => {
    setSubmitting(true);
    setActionError(null);
    try {
      const result = await submitContactMessage(data);
      if (result.ok) {
        setSubmitted(true);
        reset({ name: '', email: '', phone: '', message: '' });
      } else {
        setActionError(result.error);
      }
    } catch {
      setActionError('We could not send your message. Please try again shortly.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        role="status"
        className="border border-ui-concrete/30 bg-apeiron-black p-8 text-center"
      >
        <h2 className="text-lg font-bold uppercase tracking-widest text-primary-cream mb-3">
          Message sent
        </h2>
        <p className="text-ui-concrete leading-relaxed">
          Thanks for reaching out — we read everything and typically reply within one
          business day.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-6 text-xs uppercase tracking-widest text-primary-cream underline underline-offset-4 hover:text-accent-energy transition-colors"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Name" name="name" error={errors.name?.message} required>
          {(aria) => <Input type="text" autoComplete="name" {...aria} {...register('name')} />}
        </Field>
        <Field label="Email" name="email" error={errors.email?.message} required>
          {(aria) => <Input type="email" autoComplete="email" {...aria} {...register('email')} />}
        </Field>
      </div>

      <Field label="Phone (optional)" name="phone" error={errors.phone?.message}>
        {(aria) => <Input type="tel" autoComplete="tel" {...aria} {...register('phone')} />}
      </Field>

      <Field label="Message" name="message" error={errors.message?.message} required>
        {(aria) => (
          <textarea
            id={aria.id}
            aria-invalid={aria['aria-invalid']}
            aria-describedby={aria['aria-describedby']}
            rows={5}
            autoComplete="off"
            className="w-full bg-apeiron-black border border-ui-concrete/30 px-4 py-3 text-primary-cream placeholder:text-ui-concrete/60 focus:outline-none focus:border-primary-cream transition-colors disabled:opacity-60 resize-y"
            {...register('message')}
          />
        )}
      </Field>

      {actionError ? (
        <p role="alert" className="text-xs uppercase tracking-widest font-bold text-accent-energy">
          {actionError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-accent-energy text-primary-cream py-4 uppercase tracking-widest font-bold hover:bg-accent-energy/90 transition-colors disabled:opacity-60"
      >
        {submitting ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}