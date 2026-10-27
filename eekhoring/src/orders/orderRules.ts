import { parseDecimal } from '@/items/itemRules';
import { dayRange } from '@/purchases/purchaseRules';
import { roundQty } from '@/stock/stockRules';

// `delivered` is always derived from the line's purchases (spec 4.6), so deleting a delivery reopens it.
export function lineState(l: { quantity: number; delivered: number; cancelled_qty: number }): { open: number; status: string } {
  const open = Math.max(0, roundQty(l.quantity - l.delivered - l.cancelled_qty));
  const delivered = roundQty(l.delivered);
  if (open > 0) return { open, status: delivered > 0 ? `${delivered} of ${l.quantity} delivered` : 'on the way' };
  if (!l.cancelled_qty) return { open, status: 'delivered' };
  return { open, status: delivered > 0 ? `${delivered} delivered, rest refunded` : 'cancelled, refunded' };
}

export const partPrice = (totalCents: number, ordered: number, part: number) => Math.round((totalCents * part) / ordered);

export const refundCents = (l: { quantity: number; total_price_cents: number; cancelled_qty: number }) =>
  partPrice(l.total_price_cents, l.quantity, l.cancelled_qty);

export function validateDelivery(
  text: string,
  open: number,
  soldByWeight: boolean,
  dayIso: string,
  orderDayIso: string
): { ok: true; quantity: number } | { ok: false; error: string } {
  const q = parseDecimal(text);
  if (typeof q !== 'number' || q <= 0) return { ok: false, error: 'Enter how many arrived' };
  if (q > open) return { ok: false, error: `Only ${open} still on the way` };
  if (!soldByWeight && !Number.isInteger(q)) return { ok: false, error: 'Use whole numbers' };
  if (dayRange(dayIso)[0] < dayRange(orderDayIso)[0]) return { ok: false, error: "It can't arrive before it was ordered" };
  return { ok: true, quantity: q };
}

// Stock that counts for suggestions: what's here plus what's on the way.
export const withOnWay = (stock: number | null, onWay: number) => (onWay ? (stock ?? 0) + onWay : stock);

// Per item, rounded so a part delivery never shows float noise like 0.19999999999999998 kg.
export const onWayBy = (rows: { item_id: string; on_way: number }[]) => new Map(rows.map((o) => [o.item_id, roundQty(o.on_way)]));
