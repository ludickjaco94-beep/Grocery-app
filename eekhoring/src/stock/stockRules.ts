import { parseDecimal, type Unit } from '@/items/itemRules';

export const roundQty = (n: number) => Math.round(n * 1000) / 1000;

export const stepFor = (unit: Unit) => (unit === 'kg' ? 0.5 : 1);

export type CountRow = { itemId: string; text: string; packs: boolean; kgPerPack: number | null };
export type CountEntry = { item_id: string; quantity: number; entered_packs: number | null };

export const NO_PACK_DATA = 'log pack counts on purchases to enable';

// Blank rows are "not counted this time", never zero: a skipped row must not look like running out.
export function buildStockTake(
  rows: CountRow[]
): { ok: true; entries: CountEntry[]; skipped: number } | { ok: false; errors: Record<string, string> } {
  const entries: CountEntry[] = [];
  const errors: Record<string, string> = {};
  let skipped = 0;
  for (const r of rows) {
    const n = parseDecimal(r.text);
    if (n === null) {
      skipped++;
      continue;
    }
    if (n === 'invalid' || n < 0) errors[r.itemId] = 'Count must be 0 or more';
    else if (!r.packs) entries.push({ item_id: r.itemId, quantity: roundQty(n), entered_packs: null });
    else if (!Number.isInteger(n)) errors[r.itemId] = 'Packs must be a whole number';
    else if (r.kgPerPack === null) errors[r.itemId] = NO_PACK_DATA;
    else entries.push({ item_id: r.itemId, quantity: roundQty(n * r.kgPerPack), entered_packs: n });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, entries, skipped };
}

// A blank row shows the last count greyed out; + / − start from it so "one less than last time" is one tap.
export function bumpCount(text: string, last: number | null, step: number, sign: 1 | -1): string {
  const n = parseDecimal(text);
  const base = n === null ? (last ?? 0) : n === 'invalid' ? 0 : n;
  return String(Math.max(0, roundQty(base + sign * step)));
}

export function applyAdjustment(current: number, delta: number): number | { error: string } {
  const next = roundQty(current + delta);
  return next < 0 ? { error: `You only have ${current}. You cannot remove ${-delta}.` } : next;
}

export function usageWindowStart(now: Date, months: number): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

export type HistoryRow = { id: string; date: string; quantity: number; source: string; entered_packs: number | null };

export function withChanges(rowsOldestFirst: HistoryRow[]): (HistoryRow & { change: number | null })[] {
  return rowsOldestFirst
    .map((r, i) => ({ ...r, change: i === 0 ? null : roundQty(r.quantity - rowsOldestFirst[i - 1].quantity) }))
    .reverse();
}
