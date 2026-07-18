// ---------------------------------------------------------------------------
// Color swatch resolver — pure, framework-agnostic.
//
// Resolves a product option value (e.g. "Black", "Champagne", "#1a2b3c",
// "Dusty Rose") into a visual swatch the picker can render: either a flat
// color (hex) or a texture/pattern image URL. Layered so ANY color the
// merchant configures renders, with or without Shopify Admin swatch setup:
//
//   1. swatchImage  — Shopify `swatch.image` (texture / pattern) wins outright.
//   2. colorHex     — Shopify `swatch.color` (a hex string) → normalized.
//   3. value        — the option value itself, if it is a literal hex.
//   4. named color  — the value as a CSS / apparel color name (case-insensitive,
//                     multi-word: full phrase → last word).
//   5. hash fallback — deterministic hash of the value → HSL hex. The SAME name
//                     always renders the SAME color across renders (no
//                     Math.random). This is what makes the picker handle every
//                     possible color: any unknown name still renders a stable,
//                     distinguishable dot.
//
// Lives in `lib/` (not a component) so it is unit-testable in the node Vitest
// env (no DOM harness). Mirrors the `lib/product.ts` pure-helper convention.
// ---------------------------------------------------------------------------

/** A resolved swatch: a flat color (hex) or a texture/pattern image URL. */
export type Swatch = { kind: 'image'; url: string } | { kind: 'color'; hex: string };

/** Neutral placeholder used when no color can be resolved (empty/absent value). */
export const NEUTRAL_SWATCH_HEX = '#8a8a8a';

/**
 * Resolve a product option value to a visual swatch.
 *
 * @param value        The option value name (e.g. "Black", "Dusty Rose").
 * @param colorHex     Shopify `swatch.color` if present (hex string, nullable).
 * @param swatchImage  Shopify `swatch.image` URL if present (nullable).
 */
export function resolveSwatch(
  value: string,
  colorHex?: string | null,
  swatchImage?: string | null,
): Swatch {
  // 1. Texture / pattern image wins outright — a flat color can't represent it.
  if (swatchImage && swatchImage.trim() !== '') {
    return { kind: 'image', url: swatchImage };
  }

  // 2. Merchant-configured hex (already a string in the Storefront `Color` scalar).
  const shopifyHex = normalizeHex(colorHex);
  if (shopifyHex) return { kind: 'color', hex: shopifyHex };

  // 3. The value itself is a literal hex (merchants sometimes name values "#1a2b3c").
  //    Require a leading '#' so a short color name like "cab" or "bad" isn't
  //    misread as a hex color.
  if (value && value.trim().startsWith('#')) {
    const literalHex = normalizeHex(value);
    if (literalHex) return { kind: 'color', hex: literalHex };
  }

  // 4. Named color — CSS named colors, then the apparel name map. Multi-word
  //    names try the full phrase first ("dusty rose"), then the last word
  //    ("rose"), so "Midnight Blue" → navy even if "midnight blue" isn't listed.
  const normalized = value?.trim().toLowerCase();
  if (normalized) {
    // Try the exact phrase, then the phrase with spaces removed (CSS stores
    // multi-word names as one word — "midnight blue" → "midnightblue").
    const full = NAMED_COLORS[normalized]
      ?? APPAREL_COLORS[normalized]
      ?? NAMED_COLORS[normalized.replace(/\s+/g, '')]
      ?? APPAREL_COLORS[normalized.replace(/\s+/g, '')];
    if (full) return { kind: 'color', hex: full };

    // Then the last word ("Vintage Wine" → "wine"; "Neon Crimson" → "crimson").
    const lastWord = normalized.split(/[\s/-]+/).filter(Boolean).pop();
    if (lastWord) {
      const partial = NAMED_COLORS[lastWord] ?? APPAREL_COLORS[lastWord];
      if (partial) return { kind: 'color', hex: partial };
    }
  }

  // 5. Deterministic hash fallback — stable, distinguishable color for any
  //    unknown name. Same name → same hex, every render.
  if (!normalized) return { kind: 'color', hex: NEUTRAL_SWATCH_HEX };
  return { kind: 'color', hex: hashToHex(normalized) };
}

/**
 * Normalize a hex color string to a 6-digit `#rrggbb` lowercase form.
 * Accepts `#rgb`/`#rgba`, `#rrggbb`/`#rrggbbaa` (and the same without the leading
 * `#`). An alpha channel (the last 2 hex digits of a 4- or 8-digit form) is
 * STRIPPED — the swatch is an opaque dot, so alpha has no visual meaning and
 * keeping it would render a translucent fill over the dark page bg.
 * Returns `null` for anything that is not a valid hex color.
 */
export function normalizeHex(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim().replace(/^#/, '').toLowerCase();
  // Accept 3/4 (#rgb/#rgba) and 6/8 (#rrggbb/#rrggbbaa) digit forms only. A
  // 4- or 8-digit form carries an alpha channel (the last 2 digits) which we
  // strip below. 5- and 7-digit forms are NOT valid hex colors → null.
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) return null;
  // Strip the alpha channel if present (4- or 8-digit form).
  const core = s.length === 4 ? s.slice(0, 3) : s.length === 8 ? s.slice(0, 6) : s;
  const expanded = core.length === 3
    ? core.split('').map((c) => c + c).join('')
    : core;
  return `#${expanded}`;
}

/**
 * Deterministically map a string to a hex color via HSL. Hue is derived from a
 * stable djb2-like hash of the string; saturation and lightness are fixed so
 * swatches are vivid enough to distinguish but consistent across renders.
 */
function hashToHex(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // djb2, keep int32
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 45, 50);
}

/** Convert HSL (h: 0–360, s/l: 0–100) to a `#rrggbb` hex string. */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// ---------------------------------------------------------------------------
// Color name maps (lowercase keys → hex). Keep these as data, not logic.
// ---------------------------------------------------------------------------

/**
 * CSS named colors (the standard X11 set). A value like "Red", "Crimson", or
 * "Midnight Blue" resolves to its real color rather than a hash. The picker
 * therefore renders a merchant's color name correctly even with no Shopify
 * Admin swatch configured.
 */
const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00',
  darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493',
  deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff',
  firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22', fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520',
  gray: '#808080', green: '#008000', greenyellow: '#adff2f', grey: '#808080',
  honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c', indigo: '#4b0082',
  ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa', lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899',
  lightslategrey: '#778899', lightsteelblue: '#b0c4de', lightyellow: '#ffffe0',
  lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff',
  maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd',
  mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa',
  mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500',
  orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98',
  paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5',
  peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399', red: '#ff0000',
  rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072',
  sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d',
  silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090',
  slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4',
  tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff',
  whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
};

/**
 * Apparel color names not in the CSS set (and common merchant spellings).
 * Lets "Champagne", "Burgundy", "Camel", … render as their expected color with
 * zero Shopify Admin setup. Keys are lowercase; values are hex.
 */
const APPAREL_COLORS: Record<string, string> = {
  champagne: '#e8d5b7', burgundy: '#6e0d2a', mustard: '#e1ad01',
  terracotta: '#e2725b', camel: '#c69a59', taupe: '#766f64', sand: '#e2d2bd',
  blush: '#de5d83', sage: '#b2ac88', mauve: '#e0b0ff', rust: '#b7410e',
  charcoal: '#36454f', slate: '#708090', cobalt: '#0047ab', emerald: '#50c878',
  plum: '#8e4585', khaki: '#c1b79b', ivory: '#fffff0', offwhite: '#faf5ef',
  cream: '#f3efe7', nude: '#f2d6bd', rose: '#ff007f', wine: '#722f37',
  frost: '#e0f7ff', pearl: '#eae0c8', graphite: '#41424c', denim: '#1560bd',
  cognac: '#834333',
};