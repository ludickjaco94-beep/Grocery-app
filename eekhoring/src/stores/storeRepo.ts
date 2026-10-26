import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';

export const STORES_SQL = 'SELECT id, name, is_city FROM stores ORDER BY name COLLATE NOCASE';

// Callers check duplicates first (findDuplicate), the same way items do.
export async function addStore(name: string, isCity: boolean): Promise<string> {
  const id = randomUUID();
  await db.execute('INSERT INTO stores (id, name, is_city) VALUES (?, ?, ?)', [id, name, isCity ? 1 : 0]);
  return id;
}
