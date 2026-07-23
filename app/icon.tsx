import { ImageResponse } from 'next/og';

// ---------------------------------------------------------------------------
// Favicon — the brand "A" tile, generated at runtime (no binary asset, no
// hot-link). Obsidian field, ivory letter: the wordmark's first glyph is all
// that reads at 32px. The file convention makes Next serve this at /icon and
// inject <link rel="icon"> into every page automatically.
// ---------------------------------------------------------------------------

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 22,
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
