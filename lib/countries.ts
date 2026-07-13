// ---------------------------------------------------------------------------
// Country list + per-country address validation rules for the checkout form.
//
// The Shopify Storefront `cartDeliveryAddressesAdd` mutation takes a
// `countryCode` (a CountryCode enum = ISO 3166-1 alpha-2, e.g. "US") and an
// optional `provinceCode`. We surface a global country <select> to the buyer
// and apply country-specific province/zip requirements BEFORE the mutation
// (so the buyer gets fast, field-level feedback instead of a generic Shopify
// userError). The rules here must stay aligned with the shop's shipping zones
// in Shopify Admin — a country with no shipping zone returns no delivery
// options (handled gracefully in the UI), but a missing required province
// would never reach that point, so we validate it client-side.
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
 * Per-country address validation rules. `provinceLabel` / `zipLabel` drive the
 * field labels shown in the form (e.g. "State" vs "Province", "ZIP" vs "Postcode").
 * Countries not in `ADDRESS_RULES` fall back to `DEFAULT_ADDRESS_RULES`.
 */
export interface AddressRules {
  /** Whether a province/subdivision is required to ship. */
  requiresProvince: boolean;
  /** Field label for the subdivision (e.g. "State", "Province", "Region"). */
  provinceLabel: string;
  /** Field label for the postal code. */
  zipLabel: string;
  /** Whether a postal code is required to ship. */
  zipRequired: boolean;
  /** Optional validation pattern (anchored regex source) for the postal code. */
  zipPattern?: string;
}

/** Fallback rules for countries without an explicit entry. */
export const DEFAULT_ADDRESS_RULES: AddressRules = {
  requiresProvince: false,
  provinceLabel: 'Region',
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
 * Per-country address rules. Keys are ISO 3166-1 alpha-2 codes. Countries not
 * listed use {@link DEFAULT_ADDRESS_RULES}.
 *
 * Postal-code `zipPattern`s are anchored regex SOURCES (e.g.
 * `^[A-Z]{2}\\d\\s?\\d[A-Z]{2}$`); the schema wraps them with `^`/`$` already
 * included. They validate FORMAT only — we do not attempt to verify the code
 * exists (Shopify is the final arbiter at checkout).
 *
 * Province/subdivision is validated against a known code list
 * ({@link SUBDIVISIONS}) when one exists for the country — the form renders a
 * `<select>` so the buyer picks a real subdivision (full name shown, code sent)
 * instead of typing a free-text value the buyer naturally spells out in full
 * ("Pennsylvania") that would never match a rigid 2-letter pattern. Countries
 * with `requiresProvince: true` but no subdivision list (e.g. JP, CN, IN, MX)
 * accept free text — Shopify validates the `provinceCode` server-side.
 */
const ADDRESS_RULES: Record<string, AddressRules> = {
  US: {
    requiresProvince: true,
    provinceLabel: 'State',
    zipLabel: 'ZIP code',
    zipRequired: true,
    zipPattern: '^\\d{5}(-\\d{4})?$',
  },
  CA: {
    requiresProvince: true,
    provinceLabel: 'Province',
    zipLabel: 'Postal code',
    zipRequired: true,
    zipPattern: '^[A-Z]\\d[A-Z] ?\\d[A-Z]\\d$',
  },
  GB: {
    requiresProvince: false, // UK counties are optional for shipping.
    provinceLabel: 'County',
    zipLabel: 'Postcode',
    zipRequired: true,
    // UK postcode — broad pattern, accepts with/without the single space.
    zipPattern: '^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$',
  },
  AU: {
    requiresProvince: true,
    provinceLabel: 'State',
    zipLabel: 'Postcode',
    zipRequired: true,
    zipPattern: '^\\d{4}$',
  },
  // EU majors — postal code required, subdivision optional. Germany, France,
  // Spain, Italy, Netherlands, Belgium, Portugal, Ireland, etc.
  DE: { requiresProvince: false, provinceLabel: 'Region', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
  FR: { requiresProvince: false, provinceLabel: 'Region', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
  ES: { requiresProvince: false, provinceLabel: 'Province', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
  IT: { requiresProvince: false, provinceLabel: 'Province', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
  NL: { requiresProvince: false, provinceLabel: 'Province', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{4} ?[A-Z]{2}$' },
  BE: { requiresProvince: false, provinceLabel: 'Province', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{4}$' },
  PT: { requiresProvince: false, provinceLabel: 'District', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{4}-?\\d{3}$' },
  IE: { requiresProvince: false, provinceLabel: 'County', zipLabel: 'Eircode', zipRequired: false, zipPattern: '^[A-Z\\d]{3} ?[A-Z\\d]{3}$' },
  PL: { requiresProvince: false, provinceLabel: 'Province', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{2}-?\\d{3}$' },
  // Other large markets — postal code required, subdivision optional.
  JP: { requiresProvince: true, provinceLabel: 'Prefecture', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{3}-?\\d{4}$' },
  CN: { requiresProvince: true, provinceLabel: 'Province', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{6}$' },
  IN: { requiresProvince: true, provinceLabel: 'State', zipLabel: 'PIN code', zipRequired: true, zipPattern: '^\\d{6}$' },
  BR: { requiresProvince: true, provinceLabel: 'State', zipLabel: 'CEP', zipRequired: true, zipPattern: '^\\d{5}-?\\d{3}$' },
  MX: { requiresProvince: true, provinceLabel: 'State', zipLabel: 'Postal code', zipRequired: true, zipPattern: '^\\d{5}$' },
};

/** Look up the address rules for a country code, falling back to the default. */
export function addressRulesFor(countryCode: string): AddressRules {
  return ADDRESS_RULES[countryCode] ?? DEFAULT_ADDRESS_RULES;
}

/** Is the given country code present in the country list? */
export function isValidCountryCode(code: string): boolean {
  return COUNTRIES.some((c) => c.code === code);
}

// ---------------------------------------------------------------------------
// Subdivision lists (states / provinces / regions) for the countries where a
// rigid code is required AND a human would naturally type the full name
// ("Pennsylvania") that no 2-letter pattern would accept. For these countries
// the form renders a `<select>` (full name shown, ISO/Shopify code sent as
// `provinceCode`), and the zod schema validates the chosen value against the
// known code list. Countries with `requiresProvince: true` but no list here
// (JP, CN, IN, MX) keep a free-text province input — Shopify validates the
// `provinceCode` server-side.
//
// Codes are the subdivisions Shopify/ISO expect as `provinceCode`:
//   US — 2-letter state codes (incl. DC)
//   CA — 2-letter province/territory codes
//   AU — 3-letter state/territory codes
//   BR — 2-letter state codes
// ---------------------------------------------------------------------------

export interface Subdivision {
  /** The code sent to Shopify as `provinceCode` (and validated by zod). */
  code: string;
  /** The full name shown in the `<select>`. */
  name: string;
}

export const SUBDIVISIONS: Record<string, Subdivision[]> = {
  US: [
    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
    { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
    { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
    { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  ],
  CA: [
    { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' }, { code: 'MB', name: 'Manitoba' },
    { code: 'NB', name: 'New Brunswick' }, { code: 'NL', name: 'Newfoundland and Labrador' },
    { code: 'NS', name: 'Nova Scotia' }, { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
    { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' }, { code: 'QC', name: 'Quebec' },
    { code: 'SK', name: 'Saskatchewan' }, { code: 'YT', name: 'Yukon' },
  ],
  AU: [
    { code: 'ACT', name: 'Australian Capital Territory' }, { code: 'NSW', name: 'New South Wales' },
    { code: 'NT', name: 'Northern Territory' }, { code: 'QLD', name: 'Queensland' },
    { code: 'SA', name: 'South Australia' }, { code: 'TAS', name: 'Tasmania' },
    { code: 'VIC', name: 'Victoria' }, { code: 'WA', name: 'Western Australia' },
  ],
  BR: [
    { code: 'AC', name: 'Acre' }, { code: 'AL', name: 'Alagoas' }, { code: 'AP', name: 'Amapá' },
    { code: 'AM', name: 'Amazonas' }, { code: 'BA', name: 'Bahia' }, { code: 'CE', name: 'Ceará' },
    { code: 'DF', name: 'Distrito Federal' }, { code: 'ES', name: 'Espírito Santo' }, { code: 'GO', name: 'Goiás' },
    { code: 'MA', name: 'Maranhão' }, { code: 'MT', name: 'Mato Grosso' }, { code: 'MS', name: 'Mato Grosso do Sul' },
    { code: 'MG', name: 'Minas Gerais' }, { code: 'PA', name: 'Pará' }, { code: 'PB', name: 'Paraíba' },
    { code: 'PR', name: 'Paraná' }, { code: 'PE', name: 'Pernambuco' }, { code: 'PI', name: 'Piauí' },
    { code: 'RJ', name: 'Rio de Janeiro' }, { code: 'RN', name: 'Rio Grande do Norte' },
    { code: 'RS', name: 'Rio Grande do Sul' }, { code: 'RO', name: 'Rondônia' }, { code: 'RR', name: 'Roraima' },
    { code: 'SC', name: 'Santa Catarina' }, { code: 'SP', name: 'São Paulo' }, { code: 'SE', name: 'Sergipe' },
    { code: 'TO', name: 'Tocantins' },
  ],
};

/**
 * Look up the subdivision list for a country. Returns `undefined` when the
 * country has no known list (the form then renders a free-text province input
 * and Shopify validates the `provinceCode` server-side).
 */
export function subdivisionsFor(countryCode: string): Subdivision[] | undefined {
  return SUBDIVISIONS[countryCode];
}