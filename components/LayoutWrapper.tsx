'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { CartDrawer } from './CartDrawer';
import { CartHydrator } from './CartHydrator';
import { ProtectionHydrator } from './ProtectionHydrator';
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
      {!isCheckout && !isHome && <Footer />}
      {!isCheckout && <CartHydrator />}
      {!isCheckout && <ProtectionHydrator />}
      {!isCheckout && <CartDrawer />}
    </>
  );
}
