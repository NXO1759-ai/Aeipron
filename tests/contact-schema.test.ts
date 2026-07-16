import { describe, it, expect } from 'vitest';
import { contactFormSchema } from '@/lib/contact-schema';

// ---------------------------------------------------------------------------
// Contact-form zod schema — pure validation tests (no DOM needed).
// Verifies required fields, email format, optional phone, and message length
// bounds. Mirrors the checkout-schema test style.
// ---------------------------------------------------------------------------

const VALID_BASE = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '',
  message: 'Hello, I have a question about my order.',
};

/** Build a payload with overrides; merges onto VALID_BASE. */
function payload(overrides: Partial<typeof VALID_BASE> = {}): typeof VALID_BASE {
  return { ...VALID_BASE, ...overrides };
}

/** Collect the field paths that have issues, for concise assertions. */
function issuePaths(input: typeof VALID_BASE): string[] {
  const r = contactFormSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

describe('contactFormSchema — required fields', () => {
  it('accepts a valid payload with no phone', () => {
    expect(contactFormSchema.safeParse(payload()).success).toBe(true);
  });

  it('accepts a valid payload with a phone', () => {
    expect(contactFormSchema.safeParse(payload({ phone: '+1 555 123 4567' })).success).toBe(true);
  });

  it('rejects a missing name', () => {
    expect(issuePaths(payload({ name: '' }))).toContain('name');
  });

  it('rejects a missing email', () => {
    expect(issuePaths(payload({ email: '' }))).toContain('email');
  });

  it('rejects a missing message', () => {
    expect(issuePaths(payload({ message: '   ' }))).toContain('message');
  });
});

describe('contactFormSchema — format + length', () => {
  it('rejects a malformed email', () => {
    expect(issuePaths(payload({ email: 'not-an-email' }))).toContain('email');
  });

  it('rejects an over-long phone (max 20 chars)', () => {
    expect(issuePaths(payload({ phone: '+1 234 567 8901 234 567 8901' }))).toContain('phone');
  });

  it('rejects a message over the 5000-char max', () => {
    expect(issuePaths(payload({ message: 'x'.repeat(5001) }))).toContain('message');
  });

  it('accepts a message at the 5000-char max', () => {
    expect(contactFormSchema.safeParse(payload({ message: 'x'.repeat(5000) })).success).toBe(true);
  });

  it('accepts an empty optional phone', () => {
    expect(contactFormSchema.safeParse(payload({ phone: '' })).success).toBe(true);
  });
});