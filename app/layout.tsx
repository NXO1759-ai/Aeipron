import type {Metadata} from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css'; // Global styles
import { LayoutWrapper } from '@/components/LayoutWrapper';
import { Analytics } from '@vercel/analytics/next';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

// Icons come from the app/icon.tsx + app/apple-icon.tsx conventions (the
// brand "A" tile, generated at runtime) — never from a hot-linked CDN file
// that can rot into someone else's logo.
export const metadata: Metadata = {
  metadataBase: new URL('https://wearapeiron.com'),
  title: {
    default: 'Apeiron - Balance of Street & Luxury',
    template: '%s | Apeiron',
  },
  description: 'Heavyweight essentials, built to outlast the trend cycle. Shipped from New York.',
  openGraph: {
    type: 'website',
    siteName: 'Apeiron',
    title: 'Apeiron - Balance of Street & Luxury',
    description: 'Heavyweight essentials, built to outlast the trend cycle. Shipped from New York.',
    images: [
      {
        url: '/home/hero.jpg',
        alt: 'Macro photograph of the hood and drawstrings of a black heavyweight loopback terry hoodie',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Apeiron - Balance of Street & Luxury',
    description: 'Heavyweight essentials, built to outlast the trend cycle. Shipped from New York.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${inter.variable} font-sans antialiased bg-apeiron-black`} suppressHydrationWarning>
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
        <Analytics />
      </body>
    </html>
  );
}
