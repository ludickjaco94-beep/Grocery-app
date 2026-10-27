import type { Transaction } from '@powersync/react-native';
import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';
import { insertPurchase } from '@/purchases/purchaseRepo';
import type { PurchaseValues } from '@/purchases/purchaseRules';
import { OPEN_QTY } from '@/trips/tripRepo';
import { tripDay, type CostValues } from '@/trips/tripRules';

import { lineState, partPrice } from './orderRules';

export type OrderLine = {
  id: string;
  item_id: string;
  name: string;
  unit: string;
  sold_by_weight: number;
  quantity: number;
  total_price_cents: number;
  cancelled_qty: number;
  delivered: number;
  trip_id: string;
  store_id: string;
  ordered_on: string;
};

const LINE_COLUMNS = `l.id, l.item_id, i.name, i.unit, i.sold_by_weight, l.quantity, l.total_price_cents, l.cancelled_qty,
    COALESCE((SELECT SUM(quantity) FROM purchases WHERE order_line_id = l.id), 0) AS delivered,
    l.trip_id, t.store_id, t.date AS ordered_on
  FROM order_lines l JOIN items i ON i.id = l.item_id JOIN trips t ON t.id = l.trip_id`;

// Param: trip id.
export const ORDER_LINES_SQL = `SELECT ${LINE_COLUMNS} WHERE l.trip_id = ? ORDER BY i.name COLLATE NOCASE`;
// Param: line id.
export const ORDER_LINE_SQL = `SELECT ${LINE_COLUMNS} WHERE l.id = ?`;

export const ON_WAY_SQL = `SELECT l.item_id, SUM(${OPEN_QTY}) AS on_way FROM order_lines l WHERE ${OPEN_QTY} > 0.0001 GROUP BY l.item_id`;

export const OPEN_ORDERS_SQL = `SELECT * FROM (SELECT t.id, s.name AS shop,
    (SELECT COUNT(*) FROM order_lines l WHERE l.trip_id = t.id AND ${OPEN_QTY} > 0.0001) AS open_lines
  FROM trips t JOIN stores s ON s.id = t.store_id WHERE t.kind = 'delivery' ORDER BY t.date) WHERE open_lines > 0`;

// The order, its lines and the clearing of their list entries succeed or fail together.
export async function placeOrder(
  storeId: string,
  date: string,
  rows: (PurchaseValues & { entryId: string; item_id: string })[],
  costs: CostValues
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const tripId = randomUUID();
    await tx.execute(
      "INSERT INTO trips (id, date, store_id, fuel_cents, toll_cents, parking_cents, other_cents, notes, kind, delivery_cents) VALUES (?, ?, ?, 0, 0, 0, ?, ?, 'delivery', ?)",
      [tripId, tripDay(date), storeId, costs.other_cents, costs.notes, costs.delivery_cents]
    );
    const now = new Date().toISOString();
    for (const r of rows) {
      await tx.execute(
        'INSERT INTO order_lines (id, trip_id, item_id, quantity, total_price_cents, cancelled_qty, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [randomUUID(), tripId, r.item_id, r.quantity, r.total_price_cents, now]
      );
      await tx.execute('DELETE FROM list_entries WHERE id = ?', [r.entryId]);
    }
  });
}

// A delivered part is an ordinary purchase, so stock, usage, prices and savings see it with no special cases.
async function deliverIn(tx: Transaction, line: OrderLine, quantity: number, date: string): Promise<void> {
  await insertPurchase(tx, {
    item_id: line.item_id,
    store_id: line.store_id,
    date,
    quantity,
    total_price_cents: partPrice(line.total_price_cents, line.quantity, quantity),
    is_special: 0,
    regular_price_cents: null,
    special_note: null,
    is_emergency: 0,
    pack_count: null,
    order_line_id: line.id,
  });
}

export async function deliverLine(lineId: string, quantity: number, date: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await deliverIn(tx, await tx.get<OrderLine>(ORDER_LINE_SQL, [lineId]), quantity, date);
  });
}

export async function deliverAll(tripId: string, date: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    for (const line of await tx.getAll<OrderLine>(ORDER_LINES_SQL, [tripId])) {
      const { open } = lineState(line);
      if (open > 0) await deliverIn(tx, line, open, date);
    }
  });
}

// The undelivered rest is refunded: it never touches stock or the savings.
export async function cancelRest(lineId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const line = await tx.get<OrderLine>(ORDER_LINE_SQL, [lineId]);
    await tx.execute('UPDATE order_lines SET cancelled_qty = ? WHERE id = ?', [line.cancelled_qty + lineState(line).open, lineId]);
  });
}
