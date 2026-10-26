import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';

export const CUSTOM_CATEGORIES_SQL = 'SELECT name FROM categories ORDER BY name COLLATE NOCASE';

export async function addCategory(name: string): Promise<void> {
  await db.execute('INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)', [randomUUID(), name, new Date().toISOString()]);
}
