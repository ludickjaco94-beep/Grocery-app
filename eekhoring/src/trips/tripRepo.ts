import type { Transaction } from '@powersync/react-native';
import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';
import { dayRange } from '@/purchases/purchaseRules';

import { tripDay, type CostValues } from './tripRules';

// Trips newest first, with the shops their purchases came from.
export const TRIPS_SQL = `SELECT t.id, t.date, t.fuel_cents, t.toll_cents, t.parking_cents, t.other_cents, t.notes,
    (SELECT GROUP_CONCAT(name, ', ') FROM (SELECT DISTINCT s.name FROM purchases p JOIN stores s ON s.id = p.store_id WHERE p.trip_id = t.id)) AS shops,
    (SELECT COUNT(*) FROM purchases p WHERE p.trip_id = t.id) AS purchases
  FROM trips t ORDER BY t.date DESC`;

export async function ensureTrip(tx: Transaction, dateIso: string): Promise<string> {
  const [from, to] = dayRange(dateIso);
  const existing = await tx.getOptional<{ id: string }>('SELECT id FROM trips WHERE date >= ? AND date < ? LIMIT 1', [from, to]);
  if (existing) return existing.id;
  const id = randomUUID();
  await tx.execute(
    'INSERT INTO trips (id, date, store_id, fuel_cents, toll_cents, parking_cents, other_cents, notes) VALUES (?, ?, NULL, 0, 0, 0, 0, NULL)',
    [id, tripDay(dateIso)]
  );
  return id;
}

export async function writeTripCosts(tx: Transaction, id: string, v: CostValues): Promise<void> {
  await tx.execute('UPDATE trips SET fuel_cents = ?, toll_cents = ?, parking_cents = ?, other_cents = ?, notes = ? WHERE id = ?', [
    v.fuel_cents,
    v.toll_cents,
    v.parking_cents,
    v.other_cents,
    v.notes,
    id,
  ]);
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
       notes = COALESCE(notes, (SELECT notes FROM trips WHERE id = ?))
     WHERE id = ?`,
    [oldTripId, oldTripId, oldTripId, oldTripId, oldTripId, newTripId]
  );
  await tx.execute('UPDATE trips SET fuel_cents = 0, toll_cents = 0, parking_cents = 0, other_cents = 0, notes = NULL WHERE id = ?', [oldTripId]);
}
