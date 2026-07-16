import type {Metadata} from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css'; // Global styles
import { LayoutWrapper } from '@/components/LayoutWrapper';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const META_LOGO_URL =
  'https://cdn.shopify.com/s/files/1/0792/2286/6117/files/0f00aa58-86ff-46af-85ec-9b140350d58b_1.jpg?v=1784221209';

export const metadata: Metadata = {
  title: 'Aeipron - Balance of Street & Luxury',
  description: 'Limitless and infinite. High-Density 3D Ink Print Technology.',
  icons: {
    icon: META_LOGO_URL,
    shortcut: META_LOGO_URL,
    apple: META_LOGO_URL,
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${inter.variable} font-sans antialiased bg-apeiron-black`} suppressHydrationWarning>
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}
