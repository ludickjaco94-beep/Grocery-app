import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';

import type { ItemValues } from './itemRules';

const FIELDS = [
  'name',
  'unit',
  'category',
  'buy_mode',
  'sold_by_weight',
  'buffer_pct',
  'max_months_cover',
  'est_monthly_usage',
  'pack_size',
  'contents_qty',
  'contents_unit',
] as const;

export async function createItem(v: ItemValues): Promise<string> {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO items (id, ${FIELDS.join(', ')}, active, created_at) VALUES (?, ${FIELDS.map(() => '?').join(', ')}, 1, ?)`,
    [id, ...FIELDS.map((f) => v[f]), new Date().toISOString()]
  );
  return id;
}

// Never touches id, active or created_at: renaming keeps the item's history.
export async function updateItem(id: string, v: ItemValues): Promise<void> {
  await db.execute(`UPDATE items SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [
    ...FIELDS.map((f) => v[f]),
    id,
  ]);
}

export async function setItemActive(id: string, active: boolean): Promise<void> {
  await db.execute('UPDATE items SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
}
