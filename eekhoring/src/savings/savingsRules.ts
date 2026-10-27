import { normalPrice, unitPriceCents } from '@/purchases/purchaseRules';
import { roundQty } from '@/stock/stockRules';

export type P = {
  id: string;
  item_id: string;
  store_id: string;
  is_city: number;
  date: string;
  quantity: number;
  total_price_cents: number;
  is_special: number;
  is_emergency: number;
  regular_price_cents: number | null;
};
type Store = { id: string; is_city: number };

const key = (itemId: string, storeId: string) => `${itemId}|${storeId}`;

// Handover 5.6 normal price, per item per store.
export function normalsByStore(purchases: P[]): Map<string, number> {
  const groups = new Map<string, P[]>();
  for (const p of purchases) groups.set(key(p.item_id, p.store_id), [...(groups.get(key(p.item_id, p.store_id)) ?? []), p]);
  const out = new Map<string, number>();
  for (const [k, rows] of groups) {
    const n = normalPrice(rows);
    if (n !== null) out.set(k, n);
  }
  return out;
}

const lowest = (itemId: string, normals: Map<string, number>, stores: Store[], city: boolean) => {
  const prices = stores.filter((s) => !!s.is_city === city).flatMap((s) => normals.get(key(itemId, s.id)) ?? []);
  return prices.length ? Math.min(...prices) : null;
};

// Owner decision: the city has to beat the cheapest local shop.
export const localNormal = (itemId: string, normals: Map<string, number>, stores: Store[]) => lowest(itemId, normals, stores, false);

// A special is compared at its normal price: the one typed on it, else the shop's normal (5.6).
const normalFor = (p: P, normals: Map<string, number>) =>
  p.is_special ? (p.regular_price_cents ?? normals.get(key(p.item_id, p.store_id)) ?? null) : (normals.get(key(p.item_id, p.store_id)) ?? null);

const uniq = (xs: string[]) => [...new Set(xs)];

// Handover 5.5. Items missing a price are left out and listed, so the saving is never silently inflated.
export function tripSavings(tripPurchases: P[], allPurchases: P[], stores: Store[], tripCostCents: number) {
  const normals = normalsByStore(allPurchases);
  let city = 0;
  let local = 0;
  let gain = 0;
  const noLocal: string[] = [];
  const needsNormal: string[] = [];
  const cheaperLocally: string[] = [];
  for (const p of tripPurchases) {
    const cityUnit = normalFor(p, normals);
    if (cityUnit === null) {
      needsNormal.push(p.item_id);
      continue;
    }
    if (p.is_special) gain += (cityUnit - unitPriceCents(p.total_price_cents, p.quantity)) * p.quantity;
    const localUnit = localNormal(p.item_id, normals, stores);
    if (localUnit === null) {
      noLocal.push(p.item_id);
      continue;
    }
    if (localUnit < cityUnit) cheaperLocally.push(p.item_id);
    city += p.quantity * cityUnit;
    local += p.quantity * localUnit;
  }
  const basketCity = Math.round(city);
  const basketLocal = Math.round(local);
  const gross = basketLocal - basketCity;
  const specialGain = Math.round(gain);
  return {
    basketCity,
    basketLocal,
    gross,
    net: gross - tripCostCents,
    breakEven: tripCostCents,
    specialGain,
    // Owner: specials are never the reason to go, but the total with them still matters.
    withSpecials: gross - tripCostCents + specialGain,
    noLocal: uniq(noLocal),
    needsNormal: uniq(needsNormal),
    cheaperLocally: uniq(cheaperLocally),
  };
}

// The emergency penalty is only the extra paid over the city's normal price; a cheaper emergency never adds to the saving.
export function monthSavings(trips: { net: number; specialGain: number }[], monthPurchases: P[], allPurchases: P[], stores: Store[]) {
  const normals = normalsByStore(allPurchases);
  let penalty = 0;
  // Spec 5.5: emergency *local* purchases only.
  for (const p of monthPurchases.filter((x) => x.is_emergency && !x.is_city)) {
    const cityUnit = lowest(p.item_id, normals, stores, true);
    if (cityUnit !== null) penalty += Math.max(0, unitPriceCents(p.total_price_cents, p.quantity) - cityUnit) * p.quantity;
  }
  const net = trips.reduce((s, t) => s + t.net, 0);
  const rounded = Math.round(penalty);
  const specialGain = trips.reduce((s, t) => s + t.specialGain, 0);
  return { net, penalty: rounded, trueNet: net - rounded, specialGain, withSpecials: net - rounded + specialGain };
}

// Spec 4.2: total kg (or L) per sold-by-measure item, plus all Meat combined in kg.
export function weightTotals(purchases: (P & { unit: string; sold_by_weight: number; category: string })[]) {
  const per = new Map<string, { item_id: string; unit: string; total: number }>();
  let meatKg = 0;
  for (const p of purchases.filter((x) => x.sold_by_weight)) {
    const row = per.get(p.item_id) ?? { item_id: p.item_id, unit: p.unit, total: 0 };
    row.total = roundQty(row.total + p.quantity);
    per.set(p.item_id, row);
    if (p.unit === 'kg' && p.category.trim().toLowerCase() === 'meat') meatKg = roundQty(meatKg + p.quantity);
  }
  return { perItem: [...per.values()], meatKg };
}

export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
