import { ImageResponse } from 'next/og';

// ---------------------------------------------------------------------------
// Apple touch icon (180×180) — the brand monogram (the double-line "A"),
// vector-traced from the official logo artwork. This is the tile iOS uses for
// bookmarks, the start page, share sheets and address-bar suggestions.
// Negative spaces are punched with background-colored overlay paths so the
// mark renders identically in every SVG engine. Generated at runtime; the
// file convention makes Next serve it at /apple-icon and inject
// <link rel="apple-touch-icon">.
// ---------------------------------------------------------------------------

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const MONOGRAM =
  'M77.1,22.6L31.3,110.7L18.0,135.3L18.4,137.3L28.5,155.8L29.7,157.0L53.8,156.6L65.5,134.0L112.9,133.6L125.8,156.2L149.1,156.2L161.6,132.0L102.1,22.6Z';
const NEGATIVE_SPACE =
  'M139.1,133.6L154.4,134.0L146.7,148.1L139.1,134.8ZM119.8,134.4L120.6,133.6L131.8,133.6L136.3,140.5L141.1,150.1L129.0,150.5ZM74.7,113.1L78.3,105.9L79.5,104.7L120.6,104.7L125.4,113.1ZM90.4,83.0L91.2,83.4L99.3,97.8L99.3,99.1L82.4,98.6ZM79.5,30.3L83.2,35.9L117.4,98.6L105.7,98.6L82.4,56.0L79.1,56.0L30.9,147.7L25.6,138.9L24.4,135.3ZM98.4,28.3L152.7,127.6L62.2,128.4L50.2,150.9L36.5,151.3L36.1,150.1L80.7,65.3L85.6,73.3L87.2,77.3L65.1,119.2L135.1,118.8L85.2,28.7Z';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#050505' }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <path d={MONOGRAM} fill="#d2c6b6" />
          <path d={NEGATIVE_SPACE} fill="#050505" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
