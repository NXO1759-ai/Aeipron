'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { CartDrawer } from './CartDrawer';
import { Footer } from './Footer';

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCheckout = pathname === '/checkout';
  const isHome = pathname === '/';

  return (
    <>
      {!isCheckout && <Header />}
      <main className={!isCheckout && !isHome ? 'pt-24 min-h-screen' : 'min-h-screen'}>
        {children}
      </main>
      {!isCheckout && <Footer />}
      {!isCheckout && <CartDrawer />}
    </>
  );
}
