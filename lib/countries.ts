// ---------------------------------------------------------------------------
// Country list + per-country postal-code validation rules for the checkout
// form.
//
// The Shopify Storefront `cartDeliveryAddressesAdd` mutation takes a
// `countryCode` (a CountryCode enum = ISO 3166-1 alpha-2, e.g. "US") and a
// `zip`. The checkout form collects Address, City, and Country (no
// state/province) — Shopify derives the subdivision from the postal code. We
// surface a global country <select> and apply a country-specific postal-code
// requirement/pattern BEFORE the mutation (so the buyer gets fast,
// field-level feedback instead of a generic Shopify userError). The rules
// here must stay aligned with the shop's shipping zones in Shopify Admin — a
// country with no shipping zone returns no delivery options (handled
// gracefully in the UI).
//
// This module is pure data + helpers — safe to import from 'use client' (it
// pulls no server-only code). It is the single source of truth for the
// country <select> options and the zod refinements in lib/checkout-schema.ts.
// ---------------------------------------------------------------------------

export interface Country {
  /** ISO 3166-1 alpha-2 code — sent to Shopify as `countryCode`. */
  code: string;
  /** Display name for the <select>. */
  name: string;
}

/**
 * Per-country address validation rules. `zipLabel` drives the field label shown
 * in the form (e.g. "ZIP code" vs "Postcode"). Countries not in `ADDRESS_RULES`
 * fall back to `DEFAULT_ADDRESS_RULES`.
 *
 * Only postal-code rules live here — the checkout form collects Address, City,
 * and Country (no state/province), and Shopify derives the subdivision from the
 * postal code (or accepts the address without one). This keeps the form
 * country-agnostic and avoids maintaining a per-country subdivision list.
 */
export interface AddressRules {
  /** Field label for the postal code. */
  zipLabel: string;
  /** Whether a postal code is required to ship. */
  zipRequired: boolean;
  /** Optional validation pattern (anchored regex source) for the postal code. */
  zipPattern?: string;
}

/** Fallback rules for countries without an explicit entry. */
export const DEFAULT_ADDRESS_RULES: AddressRules = {
  zipLabel: 'Postal code',
  zipRequired: true,
};

// Comprehensive ISO 3166-1 alpha-2 country list. Kept as one flat array so the
// <select> renders in a stable, alphabetical-by-name order independent of
// shipping-zone config.
export const COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AG', name: 'Antigua & Barbuda' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AW', name: 'Aruba' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BA', name: 'Bosnia & Herzegovina' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BR', name: 'Brazil' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CA', name: 'Canada' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'KY', name: 'Cayman Islands' },
  { code: 'TD', name: 'Chad' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },
  { code: 'CG', name: 'Congo - Brazzaville' },
  { code: 'CD', name: 'Congo - Kinshasa' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CI', name: 'Côte d’Ivoire' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FK', name: 'Falkland Islands' },
  { code: 'FO', name: 'Faroe Islands' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GF', name: 'French Guiana' },
  { code: 'PF', name: 'French Polynesia' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GR', name: 'Greece' },
  { code: 'GL', name: 'Greenland' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HK', name: 'Hong Kong SAR' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },
  { code: 'JE', name: 'Jersey' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MO', name: 'Macao SAR' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },
  { code: 'MT', name: 'Malta' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'YT', name: 'Mayotte' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MS', name: 'Montserrat' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MM', name: 'Myanmar (Burma)' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NC', name: 'New Caledonia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'MK', name: 'North Macedonia' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PS', name: 'Palestinian Territories' },
  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RE', name: 'Réunion' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'BL', name: 'Saint Barthélemy' },
  { code: 'SH', name: 'Saint Helena' },
  { code: 'KN', name: 'Saint Kitts & Nevis' },
  { code: 'LC', name: 'Saint Lucia' },
  { code: 'MF', name: 'Saint Martin' },
  { code: 'VC', name: 'Saint Vincent & Grenadines' },
  { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'São Tomé & Príncipe' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SX', name: 'Sint Maarten' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' },
  { code: 'TT', name: 'Trinidad & Tobago' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TC', name: 'Turks & Caicos Islands' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'VA', name: 'Vatican City' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'VG', name: 'British Virgin Islands' },
  { code: 'YE', name: 'Yemen' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
];

/**
 * Per-country postal-code rules. Keys are ISO 3166-1 alpha-2 codes. Countries
 * not listed use {@link DEFAULT_ADDRESS_RULES}.
 *
 * `zipPattern`s are anchored regex SOURCES (e.g. `^[A-Z]\\d[A-Z] ?\\d[A-Z]\\d$`);
 * the schema wraps them with `^`/`$` already included. They validate FORMAT
 * only — we do not attempt to verify the code exists (Shopify is the final
 * arbiter at checkout). Only postal-code rules live here; the checkout form
 * collects Address, City, and Country (no state/province) and lets Shopify
 * derive the subdivision from the postal code.
 */
const ADDRESS_RULES: Record<string, AddressRules> = {
  US: {
    zipLabel: 'ZIP code',
    zipRequired: true,
    zipPattern: '^\\d{5}(-\\d{4})?$',
  },
  CA: {
    zipLabel: 'Postal code',
    zipRequired: true,
    zipPattern: '^[A-Z]\\d[A-Z] ?\\d[A-Z]\\d$',
  },
  GB: {
    zipLabel: 'Postcode',
    zipRequired: true,
    // UK postcode — broad pattern, accepts with/without the single space.
    zipPattern: '^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$',
  },
  AU: {
    zipLabel: 'Postcode',
    zipRequired: true,
    zipPattern: '^\\d{4}$',
  },
  // EU majors — postal code required.
  DE: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
  FR: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
  ES: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
  IT: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
  NL: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{4} ?[A-Z]{2}$' },
  BE: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{4}$' },
  PT: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{4}-?\\d{3}$' },
  IE: { zipLabel: 'Eircode', zipRequired: false, zipPattern: '^[A-Z\\d]{3} ?[A-Z\\d]{3}$' },
  PL: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{2}-?\\d{3}$' },
  // Other large markets — postal code required.
  JP: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{3}-?\\d{4}$' },
  CN: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{6}$' },
  IN: { zipLabel: 'PIN code', zipRequired: true, zipPattern: '^\\d{6}$' },
  BR: { zipLabel: 'CEP', zipRequired: true, zipPattern: '^\\d{5}-?\\d{3}$' },
  MX: { zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
};

/** Look up the address rules for a country code, falling back to the default. */
export function addressRulesFor(countryCode: string): AddressRules {
  return ADDRESS_RULES[countryCode] ?? DEFAULT_ADDRESS_RULES;
}

/** Is the given country code present in the country list? */
export function isValidCountryCode(code: string): boolean {
  return COUNTRIES.some((c) => c.code === code);
}