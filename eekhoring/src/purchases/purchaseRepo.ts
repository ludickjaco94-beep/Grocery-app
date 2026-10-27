import type { Transaction } from '@powersync/react-native';
import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';

import { applyStockDelta, stockDelta, type PurchaseValues } from './purchaseRules';

type Dated = { date: string; quantity: number };
type PurchaseInput = PurchaseValues & { store_id: string; date: string };

const FIELDS = [
  'store_id',
  'date',
  'quantity',
  'total_price_cents',
  'is_special',
  'regular_price_cents',
  'special_note',
  'is_emergency',
  'pack_count',
] as const;

// Every purchase write also moves stock, inside the same transaction, so the two never disagree.
async function moveStock(tx: Transaction, itemId: string, old: Dated | null, next: Dated | null, source: 'purchase' | 'adjustment') {
  const take = await tx.getOptional<{ d: string | null }>(
    "SELECT MAX(date) AS d FROM stock_counts WHERE item_id = ? AND source = 'stocktake'",
    [itemId]
  );
  const delta = stockDelta(old, next, take?.d ?? null);
  if (delta === 0) return;
  const level = await tx.getOptional<{ quantity: number }>(
    'SELECT quantity FROM stock_counts WHERE item_id = ? ORDER BY date DESC LIMIT 1',
    [itemId]
  );
  await tx.execute(
    'INSERT INTO stock_counts (id, item_id, date, quantity, source, entered_packs) VALUES (?, ?, ?, ?, ?, NULL)',
    [randomUUID(), itemId, new Date().toISOString(), applyStockDelta(level?.quantity ?? 0, delta), source]
  );
}

// For callers that write several purchases in one transaction (Complete trip).
export async function insertPurchase(tx: Transaction, p: PurchaseInput & { item_id: string }): Promise<string> {
  const id = randomUUID();
  await tx.execute(
    `INSERT INTO purchases (id, item_id, ${FIELDS.join(', ')}) VALUES (?, ?, ${FIELDS.map(() => '?').join(', ')})`,
    [id, p.item_id, ...FIELDS.map((f) => p[f])]
  );
  await moveStock(tx, p.item_id, null, p, 'purchase');
  return id;
}

export async function addPurchase(p: PurchaseInput & { item_id: string }): Promise<string> {
  let id = '';
  await db.writeTransaction(async (tx) => {
    id = await insertPurchase(tx, p);
  });
  return id;
}

// The item never changes on edit: moving a purchase to another item would rewrite two histories.
export async function updatePurchase(id: string, p: PurchaseInput): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const old = await tx.get<Dated & { item_id: string }>('SELECT item_id, date, quantity FROM purchases WHERE id = ?', [id]);
    await tx.execute(`UPDATE purchases SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [
      ...FIELDS.map((f) => p[f]),
      id,
    ]);
    await moveStock(tx, old.item_id, old, p, 'adjustment');
  });
}

export async function deletePurchase(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const old = await tx.get<Dated & { item_id: string }>('SELECT item_id, date, quantity FROM purchases WHERE id = ?', [id]);
    await tx.execute('DELETE FROM purchases WHERE id = ?', [id]);
    await moveStock(tx, old.item_id, old, null, 'adjustment');
  });
}
