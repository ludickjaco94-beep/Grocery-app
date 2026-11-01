import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { db } from '@/db/db';
import { AppSchema } from '@/db/schema';

import { canRestore, decodeBackup, encodeBackup, type Backup, type KnownTables } from './backupFormat';

// From the schema, so a table added later is backed up without touching this file.
function knownTables(): KnownTables {
  const known: KnownTables = {};
  for (const table of AppSchema.tables) {
    if (!table.localOnly) known[table.name] = ['id', ...table.columns.map((c) => c.name)];
  }
  return known;
}

export async function exportBackup(now: Date): Promise<void> {
  const backup: Backup = {};
  let total = 0;
  for (const [name, columns] of Object.entries(knownTables())) {
    const rows = await db.getAll<Record<string, unknown>>(`SELECT ${columns.join(', ')} FROM ${name}`);
    backup[name] = { columns, rows: rows.map((row) => columns.map((c) => (row[c] === null || row[c] === undefined ? null : String(row[c])))) };
    total += rows.length;
  }
  const text = encodeBackup(backup);

  const check = decodeBackup(text, knownTables());
  if (!check.ok || check.rowCount !== total) throw new Error('The backup failed its own check, so it was not shared.');

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const file = new File(Paths.cache, `eekhoring-backup-${y}-${m}-${d}.csv`);
  file.create({ overwrite: true });
  await file.write(text);
  if ((await file.text()) !== text) throw new Error('The backup failed its own check, so it was not shared.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
}

export async function restoreBackup(text: string): Promise<{ ok: true; rowCount: number } | { ok: false; error: string }> {
  const known = knownTables();
  const decoded = decodeBackup(text, known);
  if (!decoded.ok) return decoded;
  const { backup, rowCount } = decoded;

  // One transaction: any failed insert rolls everything back, so a restore never half-finishes.
  return db.writeTransaction(async (tx) => {
    const counts: Record<string, number> = {};
    for (const name of Object.keys(known)) {
      const row = await tx.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${name}`);
      counts[name] = row.n;
    }
    if (!canRestore(counts)) return { ok: false as const, error: 'This phone already has data. Restore only works on an empty app.' };

    if (backup.settings) await tx.execute('DELETE FROM settings');
    for (const [name, table] of Object.entries(backup)) {
      const sql = `INSERT INTO ${name} (${table.columns.join(', ')}) VALUES (${table.columns.map(() => '?').join(', ')})`;
      for (const row of table.rows) await tx.execute(sql, row);
    }
    return { ok: true as const, rowCount };
  });
}
