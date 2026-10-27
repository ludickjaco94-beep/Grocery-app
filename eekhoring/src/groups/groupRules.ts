import { emptyItemForm, validateItem, type BuyMode, type Unit } from '@/items/itemRules';
import { roundQty } from '@/stock/stockRules';
import { suggestBuy } from '@/usage/usageRules';

export type Measurable = { sold_by_weight: number; unit: string; contents_qty: number | null; contents_unit: string | null };

// How much of a group's base unit one of this item holds (groups spec 5.1); null = can't be measured in it.
export function holds(i: Measurable, base: string): number | null {
  if (i.sold_by_weight && i.unit === base) return 1;
  if (i.contents_unit === base && i.contents_qty !== null && i.contents_qty > 0) return i.contents_qty;
  return null;
}

export const groupName = (g: { kind: string; person: string }) => `${g.kind} · ${g.person}`;

export function checkGroupUnits(i: Measurable, groups: { kind: string; person: string; base_unit: string }[]): string | null {
  const broken = groups.find((g) => holds(i, g.base_unit) === null);
  return broken ? `Remove it from ${groupName(broken)} first` : null;
}

export type GroupForm = {
  kind: string;
  person: string;
  baseUnit: string;
  buyMode: BuyMode;
  bufferPct: string;
  maxMonthsCover: string;
  estMonthlyUsage: string;
};

export type GroupValues = {
  kind: string;
  person: string;
  base_unit: string;
  buy_mode: BuyMode;
  buffer_pct: number;
  max_months_cover: number;
  est_monthly_usage: number | null;
};

const key = (s: string) => s.trim().toLowerCase();

export function validateGroup(
  f: GroupForm,
  others: { id: string; kind: string; person: string }[],
  selfId?: string
): { ok: true; values: GroupValues } | { ok: false; errors: Partial<Record<keyof GroupForm, string>> } {
  const errors: Partial<Record<keyof GroupForm, string>> = {};
  const kind = f.kind.trim();
  const person = f.person.trim() || 'Home';
  if (!kind) errors.kind = 'Give the group a kind';
  else {
    const dup = others.find((o) => o.id !== selfId && key(o.kind) === key(kind) && key(o.person) === key(person));
    if (dup) errors.kind = `You already have ${groupName(dup)}`;
  }
  if (!f.baseUnit.trim()) errors.baseUnit = 'Pick a unit';
  // Same buffer, cap and estimate rules and copy as an item, so the two never drift apart.
  const item = validateItem({
    ...emptyItemForm,
    name: 'group',
    bufferPct: f.bufferPct,
    maxMonthsCover: f.maxMonthsCover,
    estMonthlyUsage: f.estMonthlyUsage,
  });
  if (!item.ok) Object.assign(errors, item.errors);
  if (Object.keys(errors).length || !item.ok) return { ok: false, errors };
  return {
    ok: true,
    values: {
      kind,
      person,
      base_unit: f.baseUnit.trim(),
      buy_mode: f.buyMode,
      buffer_pct: item.values.buffer_pct,
      max_months_cover: item.values.max_months_cover,
      est_monthly_usage: item.values.est_monthly_usage,
    },
  };
}

export type Member = { perMonth: number | null; stock: number | null; holds: number; share: number };

// Groups spec 5.2: everything in base units; a shared item counts by its share (50/50 for two groups).
export function groupNeed(
  members: Member[],
  g: { est_monthly_usage: number | null; buffer_pct: number; max_months_cover: number; base_unit: string; buy_mode: string }
): { perMonth: number | null; source: 'measured' | 'estimate' | 'none'; stock: number; toBuy: number | null } {
  const known = members.filter((m) => m.perMonth !== null);
  const stock = roundQty(members.reduce((s, m) => s + (m.stock ?? 0) * m.holds * m.share, 0));
  const perMonth = known.length
    ? known.reduce((s, m) => s + (m.perMonth as number) * m.holds * m.share, 0)
    : g.est_monthly_usage;
  const source = known.length ? 'measured' : perMonth !== null ? 'estimate' : 'none';
  const unit: Unit = g.base_unit === 'kg' || g.base_unit === 'L' ? g.base_unit : 'each';
  const toBuy =
    perMonth === null || g.buy_mode !== 'monthly'
      ? null
      : suggestBuy({ perMonth, buffer_pct: g.buffer_pct, max_months_cover: g.max_months_cover, stock, pack_size: null, sold_by_weight: 0, unit });
  return { perMonth, source, stock, toBuy };
}

// Cheapest per base unit first; unpriced last. Array.sort is stable, so ties keep their order.
export function cheapestOption<T extends { unitCents: number | null; holds: number }>(options: T[]): (T & { perBase: number | null })[] {
  return options
    .map((o) => ({ ...o, perBase: o.unitCents === null ? null : o.unitCents / o.holds }))
    .sort((a, b) => (a.perBase ?? Infinity) - (b.perBase ?? Infinity));
}

export const hintCount = (amount: number, holdsEach: number) => Math.ceil(roundQty(amount / holdsEach));
