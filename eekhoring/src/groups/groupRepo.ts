import { randomUUID } from 'expo-crypto';

import { db } from '@/db/db';

import type { GroupValues } from './groupRules';

export type GroupRow = GroupValues & { id: string; active: number; members: number };

// Active groups with their count of active member items.
export const GROUPS_SQL = `SELECT g.id, g.kind, g.person, g.base_unit, g.buy_mode, g.buffer_pct, g.max_months_cover,
    g.est_monthly_usage, g.active,
    (SELECT COUNT(*) FROM item_group_members m JOIN items i ON i.id = m.item_id WHERE m.group_id = g.id AND i.active = 1) AS members
  FROM item_groups g WHERE g.active = 1 ORDER BY g.kind COLLATE NOCASE, g.person COLLATE NOCASE`;

export const PEOPLE_SQL = 'SELECT name FROM people ORDER BY name COLLATE NOCASE';

const FIELDS = ['kind', 'person', 'base_unit', 'buy_mode', 'buffer_pct', 'max_months_cover', 'est_monthly_usage'] as const;

export async function createGroup(v: GroupValues): Promise<string> {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO item_groups (id, ${FIELDS.join(', ')}, active, created_at) VALUES (?, ${FIELDS.map(() => '?').join(', ')}, 1, ?)`,
    [id, ...FIELDS.map((f) => v[f]), new Date().toISOString()]
  );
  return id;
}

export async function updateGroup(id: string, v: GroupValues): Promise<void> {
  await db.execute(`UPDATE item_groups SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...FIELDS.map((f) => v[f]), id]);
}

// Archive, never delete: purchases and list history stay linked.
export async function setGroupActive(id: string, active: boolean): Promise<void> {
  await db.execute('UPDATE item_groups SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
}

export async function addMember(groupId: string, itemId: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const existing = await tx.getOptional('SELECT id FROM item_group_members WHERE group_id = ? AND item_id = ?', [groupId, itemId]);
    if (!existing) await tx.execute('INSERT INTO item_group_members (id, group_id, item_id) VALUES (?, ?, ?)', [randomUUID(), groupId, itemId]);
  });
}

export async function removeMember(groupId: string, itemId: string): Promise<void> {
  await db.execute('DELETE FROM item_group_members WHERE group_id = ? AND item_id = ?', [groupId, itemId]);
}

export async function addPerson(name: string): Promise<void> {
  await db.execute('INSERT INTO people (id, name, created_at) VALUES (?, ?, ?)', [randomUUID(), name, new Date().toISOString()]);
}
