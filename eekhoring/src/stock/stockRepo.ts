import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';

import { applyAdjustment, type CountEntry } from './stockRules';

// Each row is the level after its event, so an item's latest row is its current stock.
export const CURRENT_STOCK_SQL = `SELECT s.item_id, s.quantity FROM stock_counts s
  WHERE s.date = (SELECT MAX(date) FROM stock_counts WHERE item_id = s.item_id)`;

// Param: usageWindowStart(new Date(), months). Σ kg / Σ packs, so big and small purchases weigh fairly.
export const KG_PER_PACK_SQL = `SELECT item_id, SUM(quantity) * 1.0 / SUM(pack_count) AS kg_per_pack FROM purchases
  WHERE pack_count > 0 AND date >= ? GROUP BY item_id`;

const INSERT = 'INSERT INTO stock_counts (id, item_id, date, quantity, source, entered_packs) VALUES (?, ?, ?, ?, ?, ?)';

export async function saveStockTake(entries: CountEntry[]): Promise<void> {
  const date = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    for (const e of entries) await tx.execute(INSERT, [randomUUID(), e.item_id, date, e.quantity, 'stocktake', e.entered_packs]);
  });
}

export async function adjustStock(itemId: string, delta: number): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{ quantity: number }>(
      'SELECT quantity FROM stock_counts WHERE item_id = ? ORDER BY date DESC LIMIT 1',
      [itemId]
    );
    const next = applyAdjustment(row?.quantity ?? 0, delta);
    if (typeof next !== 'number') throw new Error(next.error);
    await tx.execute(INSERT, [randomUUID(), itemId, new Date().toISOString(), next, 'adjustment', null]);
  });
}
