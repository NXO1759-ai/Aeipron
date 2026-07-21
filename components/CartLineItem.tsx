'use client';

import Image from 'next/image';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { MAX_QTY_PER_LINE } from '@/store/use-cart';
import { formatCurrency } from '@/lib/utils';
import type { CartLine } from '@/lib/types';

// ---------------------------------------------------------------------------
// CartLineItem — the shared line row used by BOTH the CartDrawer and the /cart
// page. One component so the drawer and the full cart page can never drift in
// markup or behavior (qty stepper, remove, unit price, variant image).
//
// The line identity is the Shopify cart-line GID (`item.lineId`) — the stable
// key for update/remove. `price` is display-only (from Shopify cost). The qty
// stepper clamps at MAX_QTY_PER_LINE (client UX only); ≤ 0 removes the line.
// All mutations are delegated to the parent (which calls the cart store).
//
// The variant descriptor renders bare ("Champagne / medium") — no "Variant:"
// prefix; the label itself already reads as color / size.
// ---------------------------------------------------------------------------

export function CartLineItem({
  item,
  currencyCode,
  onSetQuantity,
  onRemove,
}: {
  item: CartLine;
  currencyCode: string;
  onSetQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
}) {
  const atMax = item.quantity >= MAX_QTY_PER_LINE;

  return (
    <div className="flex gap-4">
      <div className="relative h-24 w-20 flex-shrink-0 bg-primary-cream overflow-hidden">
        {item.image ? (
          <Image src={item.image} alt={item.name} fill sizes="80px" className="object-cover" />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col justify-between">
        <div>
          <div className="flex justify-between">
            <h3 className="text-primary-cream uppercase tracking-wider font-bold text-sm">{item.name}</h3>
            <p className="text-primary-cream font-mono">{formatCurrency(item.price, currencyCode)}</p>
          </div>
          <p className="text-ui-concrete text-sm mt-1">{item.variantLabel}</p>
        </div>
        <div className="flex justify-between items-center mt-4">
          {/* Quantity stepper */}
          <div className="flex items-center gap-3 border border-ui-concrete/30 px-2 py-1">
            <button
              onClick={() => onSetQuantity(item.lineId, item.quantity - 1)}
              aria-label={`Decrease quantity of ${item.name}`}
              className="text-ui-concrete hover:text-primary-cream transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span
              className="text-primary-cream text-sm w-5 text-center tabular-nums"
              aria-live="polite"
            >
              {item.quantity}
            </span>
            <button
              onClick={() => onSetQuantity(item.lineId, item.quantity + 1)}
              disabled={atMax}
              aria-label={`Increase quantity of ${item.name}${atMax ? ' (maximum reached)' : ''}`}
              className="text-ui-concrete hover:text-primary-cream transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => onRemove(item.lineId)}
            aria-label={`Remove ${item.name} from bag`}
            className="flex items-center gap-1 text-ui-concrete hover:text-accent-energy transition-colors text-xs uppercase tracking-widest"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
