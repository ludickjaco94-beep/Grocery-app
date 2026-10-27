import { emptyPurchaseForm, validatePurchase, type PurchaseValues } from '@/purchases/purchaseRules';

export type Entry = { id: string; item_id: string; quantity: number; added_manually: number; ticked: number };

// Make list and Refresh are one operation. Ticked and hand-added entries are the owner's: never touched.
export function planList(
  suggestions: { item_id: string; quantity: number }[],
  entries: Entry[]
): { insert: { item_id: string; quantity: number }[]; update: { id: string; quantity: number }[]; remove: string[] } {
  const want = new Map(suggestions.map((s) => [s.item_id, s.quantity]));
  const listed = new Set(entries.map((e) => e.item_id));
  const update: { id: string; quantity: number }[] = [];
  const remove: string[] = [];
  for (const e of entries) {
    if (e.ticked || e.added_manually) continue;
    const q = want.get(e.item_id);
    if (q === undefined) remove.push(e.id);
    else if (q !== e.quantity) update.push({ id: e.id, quantity: q });
  }
  return { insert: suggestions.filter((s) => !listed.has(s.item_id)), update, remove };
}

export function estimateTotal(rows: { quantity: number; unitCents: number | null }[]): { cents: number; unpriced: number } {
  const priced = rows.filter((r) => r.unitCents !== null);
  return {
    cents: Math.round(priced.reduce((s, r) => s + r.quantity * (r.unitCents as number), 0)),
    unpriced: rows.length - priced.length,
  };
}

export type TripRow = { entryId: string; quantity: string; price: string; soldByWeight: boolean };

// All or nothing: one bad row stops the whole trip, so a half-saved trip can never happen.
export function validateTrip(
  rows: TripRow[]
): { ok: true; values: (PurchaseValues & { entryId: string })[] } | { ok: false; errors: Record<string, string> } {
  const values: (PurchaseValues & { entryId: string })[] = [];
  const errors: Record<string, string> = {};
  for (const r of rows) {
    const result = validatePurchase({ ...emptyPurchaseForm, quantity: r.quantity, price: r.price }, r.soldByWeight);
    if (result.ok) values.push({ ...result.values, entryId: r.entryId });
    else errors[r.entryId] = Object.values(result.errors)[0] as string;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

export const prefillPrice = (unitCents: number | null, quantity: number) =>
  unitCents === null ? '' : (Math.round(unitCents * quantity) / 100).toFixed(2);
