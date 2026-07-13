import { describe, it, expect } from 'vitest';
import { checkoutContactSchema, toShopifyAddress } from '@/lib/checkout-schema';
import { COUNTRIES, addressRulesFor, isValidCountryCode } from '@/lib/countries';

// ---------------------------------------------------------------------------
// Checkout zod schema — pure validation tests (no DOM needed).
// Verifies required fields, email/phone format, and country-driven province/zip
// rules (US, CA, GB, AU, EU majors) + the unknown-country guard + the
// no-price-in-output trust invariant.
// ---------------------------------------------------------------------------

const VALID_BASE = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+1 555 123 4567',
  address1: '123 Main St',
  address2: '',
  city: 'Springfield',
  province: 'IL',
  zip: '62704',
  country: 'US',
};

/** Build a payload with overrides; deep-merges onto VALID_BASE. */
function payload(overrides: Partial<typeof VALID_BASE> = {}): typeof VALID_BASE {
  return { ...VALID_BASE, ...overrides };
}

/** Collect the field paths that have issues, for concise assertions. */
function issuePaths(input: typeof VALID_BASE): string[] {
  const r = checkoutContactSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

describe('checkoutContactSchema — required fields', () => {
  it('accepts a valid US address', () => {
    expect(checkoutContactSchema.safeParse(payload()).success).toBe(true);
  });

  it('rejects a missing first name', () => {
    expect(issuePaths(payload({ firstName: '' }))).toContain('firstName');
  });

  it('rejects a missing last name', () => {
    expect(issuePaths(payload({ lastName: '   ' }))).toContain('lastName');
  });

  it('rejects a missing address line 1', () => {
    expect(issuePaths(payload({ address1: '' }))).toContain('address1');
  });

  it('rejects a missing city', () => {
    expect(issuePaths(payload({ city: '' }))).toContain('city');
  });

  it('accepts address2 left empty (optional field)', () => {
    expect(checkoutContactSchema.safeParse(payload({ address2: '' })).success).toBe(true);
  });
});

describe('checkoutContactSchema — email', () => {
  it('rejects a missing email', () => {
    expect(issuePaths(payload({ email: '' }))).toContain('email');
  });

  it('rejects a malformed email', () => {
    expect(issuePaths(payload({ email: 'not-an-email' }))).toContain('email');
  });

  it('accepts a standard email', () => {
    expect(checkoutContactSchema.safeParse(payload({ email: 'a.b+c@sub.example.com' })).success).toBe(true);
  });
});

describe('checkoutContactSchema — phone (lenient)', () => {
  it('rejects a missing phone', () => {
    expect(issuePaths(payload({ phone: '' }))).toContain('phone');
  });

  it('rejects a phone that is too short', () => {
    expect(issuePaths(payload({ phone: '12345' }))).toContain('phone');
  });

  it('accepts an international phone with + and spaces', () => {
    expect(checkoutContactSchema.safeParse(payload({ phone: '+44 20 7946 0958' })).success).toBe(true);
  });

  it('accepts a phone with dashes and parentheses', () => {
    expect(checkoutContactSchema.safeParse(payload({ phone: '(555) 123-4567' })).success).toBe(true);
  });
});

describe('checkoutContactSchema — country', () => {
  it('rejects an empty country', () => {
    expect(issuePaths(payload({ country: '' }))).toContain('country');
  });

  it('rejects an unknown country code', () => {
    expect(issuePaths(payload({ country: 'ZZ' }))).toContain('country');
  });

  it('accepts every code in the country list', () => {
    for (const c of COUNTRIES) {
      // Build a minimal valid payload for that country (province/zip may be
      // optional). We only assert the COUNTRY field itself does not error;
      // province/zip rules are covered by the per-country suites below.
      const r = checkoutContactSchema.safeParse({ ...VALID_BASE, country: c.code });
      // The country path must NOT be in the issues (other fields may be, if the
      // default US province/zip don't fit this country — that's fine here).
      const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
      expect(paths).not.toContain('country');
    }
  });
});

describe('checkoutContactSchema — US rules', () => {
  it('requires a state', () => {
    expect(issuePaths(payload({ province: '' }))).toContain('province');
  });

  it('requires a 2-letter state code', () => {
    expect(issuePaths(payload({ province: 'Illinois' }))).toContain('province');
  });

  it('accepts a 2-letter state code', () => {
    expect(checkoutContactSchema.safeParse(payload({ province: 'NY' })).success).toBe(true);
  });

  it('requires a ZIP', () => {
    expect(issuePaths(payload({ zip: '' }))).toContain('zip');
  });

  it('rejects a non-ZIP postal code', () => {
    expect(issuePaths(payload({ zip: 'ABC123' }))).toContain('zip');
  });

  it('accepts a ZIP+4', () => {
    expect(checkoutContactSchema.safeParse(payload({ zip: '62704-1234' })).success).toBe(true);
  });
});

describe('checkoutContactSchema — CA rules', () => {
  const CA = { ...VALID_BASE, country: 'CA', province: 'ON', zip: 'K1A 0B1' };

  it('requires a province', () => {
    expect(issuePaths({ ...CA, province: '' })).toContain('province');
  });

  it('accepts a 2-letter province code', () => {
    expect(checkoutContactSchema.safeParse(CA).success).toBe(true);
  });

  it('accepts a Canadian postal code with or without the space', () => {
    expect(checkoutContactSchema.safeParse({ ...CA, zip: 'K1A0B1' }).success).toBe(true);
  });

  it('rejects a US-style ZIP for Canada', () => {
    expect(issuePaths({ ...CA, zip: '62704' })).toContain('zip');
  });
});

describe('checkoutContactSchema — GB rules', () => {
  const GB = { ...VALID_BASE, country: 'GB', province: '', zip: 'SW1A 1AA' };

  it('does NOT require a province (county optional)', () => {
    expect(checkoutContactSchema.safeParse(GB).success).toBe(true);
  });

  it('requires a postcode', () => {
    expect(issuePaths({ ...GB, zip: '' })).toContain('zip');
  });

  it('rejects a non-UK postcode', () => {
    expect(issuePaths({ ...GB, zip: '62704' })).toContain('zip');
  });
});

describe('checkoutContactSchema — AU rules', () => {
  const AU = { ...VALID_BASE, country: 'AU', province: 'NSW', zip: '2000' };

  it('requires a 3-letter state', () => {
    expect(issuePaths({ ...AU, province: 'New South Wales' })).toContain('province');
  });

  it('accepts a 3-letter state + 4-digit postcode', () => {
    expect(checkoutContactSchema.safeParse(AU).success).toBe(true);
  });
});

describe('checkoutContactSchema — EU majors', () => {
  it('DE: 5-digit postal required, region optional', () => {
    expect(checkoutContactSchema.safeParse({ ...VALID_BASE, country: 'DE', province: '', zip: '10115' }).success).toBe(true);
    expect(issuePaths({ ...VALID_BASE, country: 'DE', province: '', zip: '' })).toContain('zip');
  });

  it('NL: accepts 1234 AB postcode (with or without space)', () => {
    expect(checkoutContactSchema.safeParse({ ...VALID_BASE, country: 'NL', province: '', zip: '1234 AB' }).success).toBe(true);
    expect(checkoutContactSchema.safeParse({ ...VALID_BASE, country: 'NL', province: '', zip: '1234AB' }).success).toBe(true);
  });

  it('IE: postcode optional (Eircode optional)', () => {
    expect(checkoutContactSchema.safeParse({ ...VALID_BASE, country: 'IE', province: '', zip: '' }).success).toBe(true);
  });
});

describe('checkoutContactSchema — default rules (country with no explicit entry)', () => {
  it('falls back to default rules (province optional, zip required)', () => {
    // Pick a country not in ADDRESS_RULES (e.g. 'BO' Bolivia).
    const r = checkoutContactSchema.safeParse({ ...VALID_BASE, country: 'BO', province: '', zip: '' });
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    expect(paths).not.toContain('province'); // province optional by default
    expect(paths).toContain('zip'); // zip required by default
  });
});

describe('toShopifyAddress — trust invariant (no price)', () => {
  const parsed = checkoutContactSchema.parse(payload());

  it('maps firstName/lastName/address/city/country to the delivery address', () => {
    const out = toShopifyAddress(parsed);
    expect(out.deliveryAddress.firstName).toBe('Jane');
    expect(out.deliveryAddress.address1).toBe('123 Main St');
    expect(out.deliveryAddress.city).toBe('Springfield');
    expect(out.deliveryAddress.countryCode).toBe('US');
  });

  it('maps email/phone/countryCode to the buyer identity', () => {
    const out = toShopifyAddress(parsed);
    expect(out.buyerIdentity.email).toBe('jane@example.com');
    expect(out.buyerIdentity.phone).toBe('+1 555 123 4567');
    expect(out.buyerIdentity.countryCode).toBe('US');
  });

  it('passes provinceCode and zip when present', () => {
    const out = toShopifyAddress(parsed);
    expect(out.deliveryAddress.provinceCode).toBe('IL');
    expect(out.deliveryAddress.zip).toBe('62704');
  });

  it('NEVER includes a price field in the output', () => {
    const out = toShopifyAddress(parsed);
    const json = JSON.stringify(out);
    expect(json).not.toContain('"price"');
    expect(json).not.toContain('"amount"');
  });

  it('omits provinceCode/zip/address2 when empty (no empty strings sent)', () => {
    // IE: province optional + Eircode optional, so an empty province/zip is valid.
    const noExtras = checkoutContactSchema.parse({ ...VALID_BASE, address2: '', province: '', zip: '', country: 'IE' });
    const out = toShopifyAddress(noExtras);
    expect(out.deliveryAddress.provinceCode).toBeUndefined();
    expect(out.deliveryAddress.zip).toBeUndefined();
    expect(out.deliveryAddress.address2).toBeUndefined();
  });
});

describe('countries — data integrity', () => {
  it('COUNTRIES is non-empty and every entry has a 2-letter code + name', () => {
    expect(COUNTRIES.length).toBeGreaterThan(100);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate country codes', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('includes US, CA, GB, AU, and the EU majors', () => {
    for (const code of ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'PT', 'IE']) {
      expect(isValidCountryCode(code)).toBe(true);
    }
  });

  it('addressRulesFor returns the default for an unmapped country', () => {
    expect(addressRulesFor('XX').requiresProvince).toBe(false);
  });
});