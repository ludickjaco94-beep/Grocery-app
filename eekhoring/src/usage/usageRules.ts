import type { Unit } from '@/items/itemRules';
import { roundQty, usageWindowStart } from '@/stock/stockRules';

export type Dated = { date: string; quantity: number };

const DAY_MS = 86_400_000;

// Handover 5.1: used = start + bought − end per interval between stock-takes, as a 30-day month.
export function monthlyUsage(takes: Dated[], purchases: Dated[], now: Date, windowMonths: number): number | null {
  // Two stock-takes on one day: the later wins (spec 5).
  const byDay = new Map<string, Dated>();
  for (const t of [...takes].sort((a, b) => (a.date < b.date ? -1 : 1))) byDay.set(new Date(t.date).toDateString(), t);
  const sorted = [...byDay.values()];

  const intervals: { end: string; used: number; days: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const start = sorted[i - 1];
    const end = sorted[i];
    const bought = purchases.filter((p) => p.date > start.date && p.date <= end.date).reduce((s, p) => s + p.quantity, 0);
    const used = start.quantity + bought - end.quantity;
    // Negative means a purchase was never logged: the interval can't be trusted either way.
    if (used < 0) continue;
    intervals.push({ end: end.date, used, days: (Date.parse(end.date) - Date.parse(start.date)) / DAY_MS });
  }
  if (!intervals.length) return null;

  const edge = usageWindowStart(now, windowMonths);
  const inWindow = intervals.filter((i) => i.end >= edge);
  const chosen = inWindow.length ? inWindow : intervals.slice(-1);
  const days = chosen.reduce((s, i) => s + i.days, 0);
  return (chosen.reduce((s, i) => s + i.used, 0) / days) * 30;
}

export type Usage = { perMonth: number; source: 'measured' | 'estimate' } | { perMonth: null; source: 'none' };

export function usageFor(measured: number | null, estimate: number | null): Usage {
  if (measured !== null) return { perMonth: measured, source: 'measured' };
  if (estimate !== null) return { perMonth: estimate, source: 'estimate' };
  return { perMonth: null, source: 'none' };
}

// Handover 5.2 plus spec 4.2 rounding. roundQty before ceil, so float noise never adds a whole pack.
export function suggestBuy(i: {
  perMonth: number;
  buffer_pct: number;
  max_months_cover: number;
  stock: number | null;
  pack_size: number | null;
  sold_by_weight: number;
  unit: Unit;
}): number {
  const stock = i.stock ?? 0;
  const target = i.perMonth * (1 + i.buffer_pct / 100);
  const cap = i.perMonth * i.max_months_cover;
  const need = Math.min(Math.max(target - stock, 0), Math.max(0, cap - stock));
  if (need === 0) return 0;
  const step = i.sold_by_weight ? 0.1 : i.pack_size ? i.pack_size : i.unit === 'kg' || i.unit === 'L' ? 0.1 : 1;
  return roundQty(Math.ceil(roundQty(need / step)) * step);
}

// About a week left.
export const isRunningLow = (stock: number | null, perMonth: number | null) =>
  stock !== null && perMonth !== null && perMonth > 0 && stock <= perMonth * 0.25;

const num = (n: number) => String(Math.round(n * 10) / 10);

export function explainSuggestion(u: Usage, i: { buffer_pct: number; unit: string; stock: number | null }, toBuy: number | null): string {
  if (u.perMonth === null) return 'Needs data: do two stock-takes or set a monthly estimate';
  const unit = i.unit === 'kg' || i.unit === 'L' ? ` ${i.unit}` : '';
  return [
    `${u.source === 'measured' ? 'Used about' : 'Estimated'} ${num(u.perMonth)}${unit}/month`,
    `buffer ${i.buffer_pct}%`,
    i.stock === null ? 'not counted yet' : `you have ${num(i.stock)}${unit} left`,
    toBuy === null ? null : `buy ${num(toBuy)}${unit}`,
  ]
    .filter(Boolean)
    .join(', ');
}
