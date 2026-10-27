import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';
import { insertPurchase } from '@/purchases/purchaseRepo';
import type { PurchaseValues } from '@/purchases/purchaseRules';
import { ensureTrip, writeTripCosts } from '@/trips/tripRepo';
import type { CostValues } from '@/trips/tripRules';

import { planList, type Entry, type Suggestion } from './listRules';

// Unit price in cents per item: the latest non-special city purchase, else the latest non-special anywhere.
export const LAST_PRICE_SQL = `SELECT i.id AS item_id, COALESCE(
    (SELECT p.total_price_cents * 1.0 / p.quantity FROM purchases p JOIN stores s ON s.id = p.store_id
     WHERE p.item_id = i.id AND p.is_special = 0 AND s.is_city = 1 ORDER BY p.date DESC LIMIT 1),
    (SELECT p.total_price_cents * 1.0 / p.quantity FROM purchases p
     WHERE p.item_id = i.id AND p.is_special = 0 ORDER BY p.date DESC LIMIT 1)
  ) AS unit_cents FROM items i`;

const INSERT =
  'INSERT INTO list_entries (id, item_id, group_id, quantity, added_manually, ticked, ticked_at, ticked_by) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)';

export async function makeList(suggestions: Suggestion[]): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const entries = await tx.getAll<Entry>('SELECT id, item_id, group_id, quantity, added_manually, ticked FROM list_entries');
    const plan = planList(suggestions, entries);
    for (const s of plan.insert) await tx.execute(INSERT, [randomUUID(), s.item_id, s.group_id, s.quantity, 0, 0, null]);
    for (const u of plan.update) await tx.execute('UPDATE list_entries SET quantity = ? WHERE id = ?', [u.quantity, u.id]);
    for (const id of plan.remove) await tx.execute('DELETE FROM list_entries WHERE id = ?', [id]);
  });
}

// One entry per item: adding an item that's already listed does nothing.
export async function addToList(itemId: string, quantity: number, ticked: boolean): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const existing = await tx.getOptional('SELECT id FROM list_entries WHERE item_id = ?', [itemId]);
    if (existing) return;
    await tx.execute(INSERT, [randomUUID(), itemId, null, quantity, 1, ticked ? 1 : 0, ticked ? new Date().toISOString() : null]);
  });
}

// One entry per group, quantity in the group's base unit.
export async function addGroupToList(groupId: string, quantity: number, ticked: boolean): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const existing = await tx.getOptional('SELECT id FROM list_entries WHERE group_id = ?', [groupId]);
    if (existing) return;
    await tx.execute(INSERT, [randomUUID(), null, groupId, quantity, 1, ticked ? 1 : 0, ticked ? new Date().toISOString() : null]);
  });
}

export async function setEntryQuantity(id: string, quantity: number): Promise<void> {
  await db.execute('UPDATE list_entries SET quantity = ? WHERE id = ?', [quantity, id]);
}

export async function setTicked(id: string, ticked: boolean): Promise<void> {
  await db.execute('UPDATE list_entries SET ticked = ?, ticked_at = ? WHERE id = ?', [
    ticked ? 1 : 0,
    ticked ? new Date().toISOString() : null,
    id,
  ]);
}

export async function removeEntry(id: string): Promise<void> {
  await db.execute('DELETE FROM list_entries WHERE id = ?', [id]);
}

// All purchases and the clearing of their entries succeed or fail together.
export async function completeTrip(
  storeId: string,
  date: string,
  rows: (PurchaseValues & { entryId: string; item_id: string })[],
  // Set for a city shop: that day's trip costs, saved with the purchases.
  costs: CostValues | null = null
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    if (costs) await writeTripCosts(tx, await ensureTrip(tx, date), costs);
    for (const { entryId, ...p } of rows) {
      await insertPurchase(tx, { ...p, store_id: storeId, date });
      await tx.execute('DELETE FROM list_entries WHERE id = ?', [entryId]);
    }
  });
}
