import { useQuery } from '@powersync/react-native';

import { GROUPS_SQL, type GroupRow } from '@/groups/groupRepo';
import { cheapestOption, groupName, groupNeed, holds } from '@/groups/groupRules';
import type { Unit } from '@/items/itemRules';
import { LAST_PRICE_SQL } from '@/list/listRepo';
import { CURRENT_STOCK_SQL } from '@/stock/stockRepo';

import { explainSuggestion, isRunningLow, monthlyUsage, suggestBuy, usageFor, type Dated, type Usage } from './usageRules';

export type ItemUsage = { usage: Usage; stock: number | null; toBuy: number | null; low: boolean; explain: string; groups: string[] };

export type ItemOption = { item_id: string; name: string; unit: string; holds: number; unitCents: number | null };

export type GroupUsage = {
  group: GroupRow;
  name: string;
  perMonth: number | null;
  source: 'measured' | 'estimate' | 'none';
  stock: number;
  toBuy: number | null;
  options: (ItemOption & { perBase: number | null })[];
};

type ItemRow = {
  id: string;
  name: string;
  unit: Unit;
  buy_mode: string;
  buffer_pct: number;
  max_months_cover: number;
  est_monthly_usage: number | null;
  pack_size: number | null;
  sold_by_weight: number;
  contents_qty: number | null;
  contents_unit: string | null;
};

const group = <T extends { item_id: string }>(rows: T[]) => {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.item_id, [...(m.get(r.item_id) ?? []), r]);
  return m;
};

// shortcut: loads all stock-take and purchase rows, fine for ~150 items and a few years; filter by date in SQL if the Stock screen gets slow
export function useUsage(): { byItem: Map<string, ItemUsage>; byGroup: Map<string, GroupUsage>; isLoading: boolean } {
  const items = useQuery<ItemRow>(
    `SELECT id, name, unit, buy_mode, buffer_pct, max_months_cover, est_monthly_usage, pack_size, sold_by_weight,
            contents_qty, contents_unit FROM items WHERE active = 1`
  );
  const takes = useQuery<Dated & { item_id: string }>("SELECT item_id, date, quantity FROM stock_counts WHERE source = 'stocktake'");
  const bought = useQuery<Dated & { item_id: string }>('SELECT item_id, date, quantity FROM purchases');
  const stock = useQuery<{ item_id: string; quantity: number }>(CURRENT_STOCK_SQL);
  const settings = useQuery<{ usage_window_months: number | null }>('SELECT usage_window_months FROM settings LIMIT 1');
  const groups = useQuery<GroupRow>(GROUPS_SQL);
  const members = useQuery<{ group_id: string; item_id: string }>(
    'SELECT m.group_id, m.item_id FROM item_group_members m JOIN item_groups g ON g.id = m.group_id WHERE g.active = 1'
  );
  const prices = useQuery<{ item_id: string; unit_cents: number | null }>(LAST_PRICE_SQL);

  const isLoading = [items, takes, bought, stock, settings, groups, members, prices].some((q) => q.isLoading);
  const months = settings.data[0]?.usage_window_months ?? 3;
  const now = new Date();
  const takesBy = group(takes.data);
  const boughtBy = group(bought.data);
  const stockBy = new Map(stock.data.map((s) => [s.item_id, s.quantity]));
  const priceBy = new Map(prices.data.map((p) => [p.item_id, p.unit_cents]));
  const itemBy = new Map(items.data.map((i) => [i.id, i]));
  const groupBy = new Map(groups.data.map((g) => [g.id, g]));
  // Only active items in active groups count, so the 50/50 share follows archiving.
  const live = members.data.filter((m) => itemBy.has(m.item_id) && groupBy.has(m.group_id));
  const groupsOf = group(live);

  const byItem = new Map<string, ItemUsage>();
  for (const i of items.data) {
    const usage = usageFor(monthlyUsage(takesBy.get(i.id) ?? [], boughtBy.get(i.id) ?? [], now, months), i.est_monthly_usage);
    const current = stockBy.get(i.id) ?? null;
    const names = (groupsOf.get(i.id) ?? []).map((m) => groupName(groupBy.get(m.group_id) as GroupRow));
    // A grouped item's need goes through its group(s): it never gets a list row of its own.
    const toBuy =
      !names.length && i.buy_mode === 'monthly' && usage.perMonth !== null ? suggestBuy({ ...i, perMonth: usage.perMonth, stock: current }) : null;
    byItem.set(i.id, {
      usage,
      stock: current,
      toBuy,
      low: isRunningLow(current, usage.perMonth),
      explain: names.length
        ? `Bought as part of ${names.join(', ')}`
        : explainSuggestion(usage, { buffer_pct: i.buffer_pct, unit: i.unit, stock: current }, toBuy),
      groups: names,
    });
  }

  const byGroup = new Map<string, GroupUsage>();
  for (const g of groups.data) {
    const options: ItemOption[] = [];
    const need: Parameters<typeof groupNeed>[0] = [];
    for (const m of live.filter((x) => x.group_id === g.id)) {
      const i = itemBy.get(m.item_id) as ItemRow;
      const h = holds(i, g.base_unit);
      if (h === null) continue;
      const u = byItem.get(i.id) as ItemUsage;
      need.push({ perMonth: u.usage.perMonth, stock: u.stock, holds: h, share: 1 / (groupsOf.get(i.id)?.length ?? 1) });
      options.push({ item_id: i.id, name: i.name, unit: i.unit, holds: h, unitCents: priceBy.get(i.id) ?? null });
    }
    byGroup.set(g.id, { group: g, name: groupName(g), ...groupNeed(need, g), options: cheapestOption(options) });
  }
  return { byItem, byGroup, isLoading };
}
