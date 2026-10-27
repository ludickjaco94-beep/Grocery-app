import { dayRange, parseMoney } from '@/purchases/purchaseRules';

// One trip per day of city shopping, however many city shops (owner decision): keyed by the day's start.
export const tripDay = (iso: string) => dayRange(iso)[0];

export function tripIdFor(p: { date: string; is_city: number }, tripsByDay: Map<string, string>): string | 'new' | null {
  if (!p.is_city) return null;
  return tripsByDay.get(tripDay(p.date)) ?? 'new';
}

export type CostForm = { fuel: string; toll: string; parking: string; other: string; note: string };
export type CostValues = { fuel_cents: number; toll_cents: number; parking_cents: number; other_cents: number; notes: string | null };

const MONEY: (keyof CostForm & keyof typeof COLUMN)[] = ['fuel', 'toll', 'parking', 'other'];
const COLUMN = { fuel: 'fuel_cents', toll: 'toll_cents', parking: 'parking_cents', other: 'other_cents' } as const;

export function validateCosts(f: CostForm): { ok: true; values: CostValues } | { ok: false; errors: Partial<Record<keyof CostForm, string>> } {
  const errors: Partial<Record<keyof CostForm, string>> = {};
  const values: CostValues = { fuel_cents: 0, toll_cents: 0, parking_cents: 0, other_cents: 0, notes: f.note.trim() || null };
  for (const k of MONEY) {
    const cents = parseMoney(f[k]);
    if (cents === 'invalid') errors[k] = 'Enter an amount like 480 or 480,50';
    else values[COLUMN[k]] = cents ?? 0;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

export const tripCost = (t: { fuel_cents: number; toll_cents: number; parking_cents: number; other_cents: number }) =>
  t.fuel_cents + t.toll_cents + t.parking_cents + t.other_cents;

export const costsToForm = (t: CostValues): CostForm => ({
  fuel: t.fuel_cents ? (t.fuel_cents / 100).toFixed(2) : '',
  toll: t.toll_cents ? (t.toll_cents / 100).toFixed(2) : '',
  parking: t.parking_cents ? (t.parking_cents / 100).toFixed(2) : '',
  other: t.other_cents ? (t.other_cents / 100).toFixed(2) : '',
  note: t.notes ?? '',
});

export const tripTitle = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
