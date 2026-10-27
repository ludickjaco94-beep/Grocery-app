import { useQuery } from '@powersync/react-native';

import type { Unit } from '@/items/itemRules';
import { CURRENT_STOCK_SQL } from '@/stock/stockRepo';

import { explainSuggestion, isRunningLow, monthlyUsage, suggestBuy, usageFor, type Dated, type Usage } from './usageRules';

export type ItemUsage = { usage: Usage; stock: number | null; toBuy: number | null; low: boolean; explain: string };

type ItemRow = {
  id: string;
  unit: Unit;
  buy_mode: string;
  buffer_pct: number;
  max_months_cover: number;
  est_monthly_usage: number | null;
  pack_size: number | null;
  sold_by_weight: number;
};

const group = (rows: (Dated & { item_id: string })[]) => {
  const m = new Map<string, Dated[]>();
  for (const r of rows) m.set(r.item_id, [...(m.get(r.item_id) ?? []), r]);
  return m;
};

// shortcut: loads all stock-take and purchase rows, fine for ~150 items and a few years; filter by date in SQL if the Stock screen gets slow
export function useUsage(): { byItem: Map<string, ItemUsage>; isLoading: boolean } {
  const items = useQuery<ItemRow>(
    'SELECT id, unit, buy_mode, buffer_pct, max_months_cover, est_monthly_usage, pack_size, sold_by_weight FROM items WHERE active = 1'
  );
  const takes = useQuery<Dated & { item_id: string }>("SELECT item_id, date, quantity FROM stock_counts WHERE source = 'stocktake'");
  const bought = useQuery<Dated & { item_id: string }>('SELECT item_id, date, quantity FROM purchases');
  const stock = useQuery<{ item_id: string; quantity: number }>(CURRENT_STOCK_SQL);
  const settings = useQuery<{ usage_window_months: number | null }>('SELECT usage_window_months FROM settings LIMIT 1');

  const isLoading = items.isLoading || takes.isLoading || bought.isLoading || stock.isLoading || settings.isLoading;
  const months = settings.data[0]?.usage_window_months ?? 3;
  const now = new Date();
  const takesBy = group(takes.data);
  const boughtBy = group(bought.data);
  const stockBy = new Map(stock.data.map((s) => [s.item_id, s.quantity]));

  const byItem = new Map<string, ItemUsage>();
  for (const i of items.data) {
    const usage = usageFor(monthlyUsage(takesBy.get(i.id) ?? [], boughtBy.get(i.id) ?? [], now, months), i.est_monthly_usage);
    const current = stockBy.get(i.id) ?? null;
    const toBuy = i.buy_mode === 'monthly' && usage.perMonth !== null ? suggestBuy({ ...i, perMonth: usage.perMonth, stock: current }) : null;
    byItem.set(i.id, {
      usage,
      stock: current,
      toBuy,
      low: isRunningLow(current, usage.perMonth),
      explain: explainSuggestion(usage, { buffer_pct: i.buffer_pct, unit: i.unit, stock: current }, toBuy),
    });
  }
  return { byItem, isLoading };
}
