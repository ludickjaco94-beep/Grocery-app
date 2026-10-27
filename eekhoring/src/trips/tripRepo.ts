import type { Transaction } from '@powersync/react-native';
import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';
import { dayRange } from '@/purchases/purchaseRules';

import { tripDay, type CostValues } from './tripRules';

// Trips newest first, with the shops their purchases came from.
// What's still on the way for an order line `l` (spec 4.6).
export const OPEN_QTY = `(l.quantity - l.cancelled_qty - COALESCE((SELECT SUM(quantity) FROM purchases WHERE order_line_id = l.id), 0))`;

export const TRIPS_SQL = `SELECT t.id, t.date, t.fuel_cents, t.toll_cents, t.parking_cents, t.other_cents, t.notes, t.kind,
    COALESCE(t.delivery_cents, 0) AS delivery_cents,
    COALESCE((SELECT GROUP_CONCAT(name, ', ') FROM (SELECT DISTINCT s.name FROM purchases p JOIN stores s ON s.id = p.store_id WHERE p.trip_id = t.id)),
      (SELECT name FROM stores WHERE id = t.store_id)) AS shops,
    (SELECT COUNT(*) FROM purchases p WHERE p.trip_id = t.id) AS purchases,
    (SELECT COUNT(*) FROM order_lines l WHERE l.trip_id = t.id AND ${OPEN_QTY} > 0.0001) AS open_lines
  FROM trips t ORDER BY t.date DESC`;

export async function ensureTrip(tx: Transaction, dateIso: string): Promise<string> {
  const [from, to] = dayRange(dateIso);
  // Drive trips only: a delivery ordered the same day stays its own trip.
  const existing = await tx.getOptional<{ id: string }>(
    "SELECT id FROM trips WHERE date >= ? AND date < ? AND (kind IS NULL OR kind = 'drive') LIMIT 1",
    [from, to]
  );
  if (existing) return existing.id;
  const id = randomUUID();
  await tx.execute(
    "INSERT INTO trips (id, date, store_id, fuel_cents, toll_cents, parking_cents, other_cents, notes, kind, delivery_cents) VALUES (?, ?, NULL, 0, 0, 0, 0, NULL, 'drive', 0)",
    [id, tripDay(dateIso)]
  );
  return id;
}

export async function writeTripCosts(tx: Transaction, id: string, v: CostValues): Promise<void> {
  await tx.execute(
    'UPDATE trips SET fuel_cents = ?, toll_cents = ?, parking_cents = ?, other_cents = ?, delivery_cents = ?, notes = ? WHERE id = ?',
    [v.fuel_cents, v.toll_cents, v.parking_cents, v.other_cents, v.delivery_cents, v.notes, id]
  );
}

export async function updateTripCosts(id: string, v: CostValues): Promise<void> {
  await db.writeTransaction((tx) => writeTripCosts(tx, id, v));
}

// When an edit moves a trip's last purchase to another trip, the costs go with it, so fuel never strands on an empty trip.
export async function moveCostsIfEmptied(tx: Transaction, oldTripId: string | null, newTripId: string | null): Promise<void> {
  if (!oldTripId || !newTripId || oldTripId === newTripId) return;
  const left = await tx.get<{ n: number }>('SELECT COUNT(*) AS n FROM purchases WHERE trip_id = ?', [oldTripId]);
  if (left.n > 0) return;
  await tx.execute(
    `UPDATE trips SET
       fuel_cents = fuel_cents + (SELECT fuel_cents FROM trips WHERE id = ?),
       toll_cents = toll_cents + (SELECT toll_cents FROM trips WHERE id = ?),
       parking_cents = parking_cents + (SELECT parking_cents FROM trips WHERE id = ?),
       other_cents = other_cents + (SELECT other_cents FROM trips WHERE id = ?),
       delivery_cents = COALESCE(delivery_cents, 0) + COALESCE((SELECT delivery_cents FROM trips WHERE id = ?), 0),
       notes = COALESCE(notes, (SELECT notes FROM trips WHERE id = ?))
     WHERE id = ?`,
    [oldTripId, oldTripId, oldTripId, oldTripId, oldTripId, oldTripId, newTripId]
  );
  await tx.execute('UPDATE trips SET fuel_cents = 0, toll_cents = 0, parking_cents = 0, other_cents = 0, delivery_cents = 0, notes = NULL WHERE id = ?', [oldTripId]);
}
