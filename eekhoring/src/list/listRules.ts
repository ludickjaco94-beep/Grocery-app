import { emptyPurchaseForm, validatePurchase, type PurchaseValues } from '@/purchases/purchaseRules';

export type Entry = {
  id: string;
  item_id: string | null;
  group_id: string | null;
  quantity: number;
  added_manually: number;
  ticked: number;
};
export type Suggestion = { item_id: string | null; group_id: string | null; quantity: number };

// An entry is for one item or one group, never both.
const keyOf = (x: { item_id: string | null; group_id: string | null }) => (x.group_id ? `g:${x.group_id}` : `i:${x.item_id}`);

// Make list and Refresh are one operation. Ticked and hand-added entries are the owner's: never touched.
export function planList(
  suggestions: Suggestion[],
  entries: Entry[]
): { insert: Suggestion[]; update: { id: string; quantity: number }[]; remove: string[] } {
  const want = new Map(suggestions.map((s) => [keyOf(s), s.quantity]));
  const listed = new Set(entries.map(keyOf));
  const update: { id: string; quantity: number }[] = [];
  const remove: string[] = [];
  for (const e of entries) {
    if (e.ticked || e.added_manually) continue;
    const q = want.get(keyOf(e));
    if (q === undefined) remove.push(e.id);
    else if (q !== e.quantity) update.push({ id: e.id, quantity: q });
  }
  return { insert: suggestions.filter((s) => !listed.has(keyOf(s))), update, remove };
}

export function estimateTotal(rows: { quantity: number; unitCents: number | null }[]): { cents: number; unpriced: number } {
  const priced = rows.filter((r) => r.unitCents !== null);
  return {
    cents: Math.round(priced.reduce((s, r) => s + r.quantity * (r.unitCents as number), 0)),
    unpriced: rows.length - priced.length,
  };
}

// One line per product bought; a group entry can have several lines (a mix of its products).
export type TripRow = { key: string; entryId: string; itemId: string | null; quantity: string; price: string; soldByWeight: boolean };

// All or nothing: one bad line stops the whole trip, so a half-saved trip can never happen.
export function validateTrip(
  rows: TripRow[]
): { ok: true; values: (PurchaseValues & { entryId: string; item_id: string })[] } | { ok: false; errors: Record<string, string> } {
  const values: (PurchaseValues & { entryId: string; item_id: string })[] = [];
  const errors: Record<string, string> = {};
  for (const r of rows) {
    if (r.itemId === null) {
      errors[r.key] = 'Pick which one you bought';
      continue;
    }
    const result = validatePurchase({ ...emptyPurchaseForm, quantity: r.quantity, price: r.price }, r.soldByWeight);
    if (result.ok) values.push({ ...result.values, entryId: r.entryId, item_id: r.itemId });
    else errors[r.key] = Object.values(result.errors)[0] as string;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

export const prefillPrice = (unitCents: number | null, quantity: number) =>
  unitCents === null ? '' : (Math.round(unitCents * quantity) / 100).toFixed(2);
