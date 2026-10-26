import { parseDecimal } from '@/items/itemRules';
import { roundQty } from '@/stock/stockRules';

// Cents. Accepts "R 12,50" as typed on the phone; more than 2 decimals is a typo, not a price.
export function parseMoney(s: string): number | null | 'invalid' {
  const t = s.trim().replace(/^[^\d.,-]+/, '').trim();
  const n = parseDecimal(t);
  if (n === null || n === 'invalid') return n;
  if (n < 0 || !/^\d*([.,]\d{0,2})?$/.test(t)) return 'invalid';
  return Math.round(n * 100);
}

export const formatMoney = (cents: number, symbol: string) => `${symbol}${(cents / 100).toFixed(2)}`;

export type PurchaseFormState = {
  quantity: string;
  priceMode: 'total' | 'unit';
  price: string;
  special: boolean;
  normalPrice: string;
  note: string;
  emergency: boolean;
  packs: string;
};

export const emptyPurchaseForm: PurchaseFormState = {
  quantity: '',
  priceMode: 'total',
  price: '',
  special: false,
  normalPrice: '',
  note: '',
  emergency: false,
  packs: '',
};

export type PurchaseValues = {
  quantity: number;
  total_price_cents: number;
  is_special: 0 | 1;
  regular_price_cents: number | null;
  special_note: string | null;
  is_emergency: 0 | 1;
  pack_count: number | null;
};

export function validatePurchase(
  f: PurchaseFormState,
  soldByWeight: boolean
): { ok: true; values: PurchaseValues } | { ok: false; errors: Partial<Record<keyof PurchaseFormState, string>> } {
  const errors: Partial<Record<keyof PurchaseFormState, string>> = {};

  const qty = parseDecimal(f.quantity);
  if (qty === null) errors.quantity = 'Enter how many you bought';
  else if (qty === 'invalid' || qty <= 0) errors.quantity = 'Quantity must be more than 0';

  const price = parseMoney(f.price);
  if (price === null) errors.price = 'Enter the price paid';
  else if (price === 'invalid' || price <= 0) errors.price = 'Price must be more than 0';

  const normal = f.special ? parseMoney(f.normalPrice) : null;
  if (normal === 'invalid' || normal === 0) errors.normalPrice = 'Normal price must be blank or more than 0';

  const packs = soldByWeight ? parseDecimal(f.packs) : null;
  if (packs === 'invalid' || (packs !== null && (!Number.isInteger(packs) || packs < 1)))
    errors.packs = 'Packs must be a whole number';

  if (Object.keys(errors).length) return { ok: false, errors };
  const quantity = roundQty(qty as number);
  // Weight items are always priced by the total paid (spec 4.2).
  const total = soldByWeight || f.priceMode === 'total' ? (price as number) : Math.round((price as number) * quantity);
  return {
    ok: true,
    values: {
      quantity,
      total_price_cents: total,
      is_special: f.special ? 1 : 0,
      regular_price_cents: f.special ? (normal as number | null) : null,
      special_note: f.special ? f.note.trim() || null : null,
      is_emergency: f.emergency ? 1 : 0,
      pack_count: packs as number | null,
    },
  };
}

export function purchaseToForm(v: PurchaseValues): PurchaseFormState {
  return {
    quantity: String(v.quantity),
    priceMode: 'total',
    price: (v.total_price_cents / 100).toFixed(2),
    special: v.is_special === 1,
    normalPrice: v.regular_price_cents === null ? '' : (v.regular_price_cents / 100).toFixed(2),
    note: v.special_note ?? '',
    emergency: v.is_emergency === 1,
    packs: v.pack_count === null ? '' : String(v.pack_count),
  };
}

export const unitPriceCents = (totalCents: number, quantity: number) => totalCents / quantity;

// Handover 5.6: median of the last 3 non-special unit prices, else the most recent one. Specials never count.
export function normalPrice(rows: { date: string; quantity: number; total_price_cents: number; is_special: number }[]): number | null {
  const prices = rows
    .filter((r) => !r.is_special)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((r) => unitPriceCents(r.total_price_cents, r.quantity));
  if (!prices.length) return null;
  if (prices.length < 3) return Math.round(prices[0]);
  return Math.round(prices.slice(0, 3).sort((a, b) => a - b)[1]);
}

// A stock-take already counted anything bought before it, so only later purchases move stock.
export function stockDelta(
  old: { date: string; quantity: number } | null,
  next: { date: string; quantity: number } | null,
  lastStocktake: string | null
): number {
  const effect = (p: { date: string; quantity: number } | null) =>
    p && (lastStocktake === null || p.date > lastStocktake) ? p.quantity : 0;
  return roundQty(effect(next) - effect(old));
}

export const applyStockDelta = (current: number, delta: number) => roundQty(Math.max(0, current + delta));

export function shiftDay(iso: string, days: number, now: Date): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d > now ? now.toISOString() : d.toISOString();
}

// Today: the real save time. An earlier day: its start, so a stock-take that day is taken to have counted it
// (fails safe: stock reads low rather than double-counting).
export function purchaseDate(day: string, now: Date): string {
  return new Date(day).toDateString() === now.toDateString() ? now.toISOString() : dayRange(day)[0];
}

export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso).toDateString();
  if (d === now.toDateString()) return 'Today';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d === y.toDateString()) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function dayRange(iso: string): [string, string] {
  const d = new Date(iso);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return [start.toISOString(), end.toISOString()];
}
