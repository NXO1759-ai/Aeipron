import { ImageResponse } from 'next/og';

// ---------------------------------------------------------------------------
// Favicon — the brand monogram (the double-line "A"), vector-traced from the
// official logo artwork and rendered at runtime (no binary asset, no hot-link).
// The negative spaces are punched with background-colored overlay paths, so
// the mark renders identically in every SVG engine (no fill-rule dependence).
// The file convention makes Next serve this at /icon and inject
// <link rel="icon"> into every page automatically.
// ---------------------------------------------------------------------------

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Tighter crop than the 180px tile (6% padding): favicons render at 16–32px,
// where the mark needs every pixel it can get.
const MONOGRAM =
  'M13.5,2.8L4.5,20.1L1.9,24.8L2.0,25.2L4.0,28.9L4.2,29.1L8.9,29.0L11.2,24.6L20.5,24.5L23.0,28.9L27.6,28.9L30.0,24.2L18.4,2.8Z';
const NEGATIVE_SPACE =
  'M25.6,24.5L28.6,24.6L27.1,27.4L25.6,24.8ZM21.8,24.7L22.0,24.5L24.2,24.5L25.0,25.9L26.0,27.8L23.6,27.8ZM13.0,20.5L13.7,19.1L14.0,18.9L22.0,18.9L22.9,20.5ZM16.1,14.6L16.2,14.7L17.8,17.5L17.8,17.8L14.5,17.7ZM14.0,4.3L14.7,5.4L21.3,17.7L19.1,17.7L14.5,9.4L13.9,9.4L4.4,27.3L3.4,25.6L3.2,24.8ZM17.7,3.9L28.3,23.4L10.6,23.5L8.2,27.9L5.5,28.0L5.5,27.8L14.2,11.2L15.1,12.7L15.4,13.5L11.1,21.7L24.8,21.6L15.1,4.0Z';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#050505' }}>
        <svg width="32" height="32" viewBox="0 0 32 32">
          <path d={MONOGRAM} fill="#d2c6b6" />
          <path d={NEGATIVE_SPACE} fill="#050505" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
