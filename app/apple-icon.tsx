import { ImageResponse } from 'next/og';

// ---------------------------------------------------------------------------
// Apple touch icon (180×180) — the tile iOS uses for bookmarks, the start
// page, share sheets and address-bar suggestions. Same brand "A" as the
// favicon, sized up. Generated at runtime; the file convention makes Next
// serve it at /apple-icon and inject <link rel="apple-touch-icon">.
// ---------------------------------------------------------------------------

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#050505',
          color: '#d2c6b6',
          fontSize: 104,
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        A
      </div>
    ),
    { ...size },
  );
}
