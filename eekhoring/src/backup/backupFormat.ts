export type BackupTable = { columns: string[]; rows: (string | null)[][] };
export type Backup = Record<string, BackupTable>;
export type KnownTables = Record<string, string[]>;

const MAGIC = 'eekhoring-backup';
const VERSION = 1;
const END = 'end-of-backup';
const NOT_BACKUP = "This isn't an Eekhoring backup file.";
const DAMAGED = 'This backup file is damaged or incomplete, so nothing was restored.';
const DATE_COLUMNS = ['date', 'created_at', 'ticked_at'];
const DATE_FORM = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;
const CHANGED = "This file was changed by another program, so it can't be restored safely. Use the file as the app shared it.";

// null is an empty field and '' is "", so a restore gets back exactly what was saved.
function encodeField(v: string | null): string {
  if (v === null) return '';
  return v === '' || /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const encodeRecord = (fields: (string | null)[]) => fields.map(encodeField).join(',');

export function encodeBackup(backup: Backup): string {
  const lines = [encodeRecord([MAGIC, String(VERSION)])];
  let count = 0;
  for (const [name, table] of Object.entries(backup)) {
    lines.push(encodeRecord(['table', name]), encodeRecord(table.columns));
    for (const row of table.rows) lines.push(encodeRecord(row));
    count += table.rows.length;
  }
  lines.push(encodeRecord([END, String(count)]));
  return lines.join('\n') + '\n';
}

// A character loop, because line breaks inside quotes and null versus "" rule out split. Returns null on an unclosed quote.
function parseRecords(text: string): (string | null)[][] | null {
  const records: (string | null)[][] = [];
  let record: (string | null)[] = [];
  let field = '';
  let wasQuoted = false;
  let inQuotes = false;
  const endField = () => {
    record.push(field === '' && !wasQuoted ? null : field);
    field = '';
    wasQuoted = false;
  };
  const endRecord = () => {
    endField();
    if (record.length > 1 || record[0] !== null) records.push(record); // blank lines are not rows
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else inQuotes = false;
    } else if (c === '"') {
      inQuotes = true;
      wasQuoted = true;
    } else if (c === ',') endField();
    else if (c === '\n') endRecord();
    else if (c !== '\r') field += c;
  }
  if (inQuotes) return null;
  if (field !== '' || wasQuoted || record.length > 0) endRecord();
  return records;
}

export function decodeBackup(text: string, known: KnownTables): { ok: true; backup: Backup; rowCount: number } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const records = parseRecords(text.replace(/^﻿/, ''));
  if (!records) return fail(DAMAGED);

  const head = records[0];
  if (!head || head.length !== 2 || head[0] !== MAGIC) return fail(NOT_BACKUP);
  if (Number(head[1]) > VERSION) return fail('This backup came from a newer version of the app. Update the app first.');
  if (head[1] !== String(VERSION)) return fail(NOT_BACKUP);

  const tail = records[records.length - 1];
  if (records.length < 2 || tail.length !== 2 || tail[0] !== END) return fail(DAMAGED);

  const backup: Backup = {};
  let current: BackupTable | null = null;
  let rowCount = 0;
  for (let i = 1; i < records.length - 1; i++) {
    const record = records[i];
    if (record.length === 2 && record[0] === 'table') {
      // These names go into SQL text, so only names from the app's own schema get through.
      const name = record[1] ?? '';
      if (!Object.keys(known).includes(name) || Object.keys(backup).includes(name)) return fail(NOT_BACKUP);
      const columns = records[++i];
      if (!columns || columns[0] !== 'id' || new Set(columns).size !== columns.length) return fail(NOT_BACKUP);
      if (columns.some((c) => c === null || !known[name].includes(c))) return fail(NOT_BACKUP);
      current = { columns: columns as string[], rows: [] };
      backup[name] = current;
    } else {
      if (!current || record.length !== current.columns.length || !record[0]) return fail(DAMAGED);
      const { columns } = current;
      if (record.some((v, c) => v !== null && DATE_COLUMNS.includes(columns[c]) && !DATE_FORM.test(v))) return fail(CHANGED);
      current.rows.push(record);
      rowCount++;
    }
  }
  if (tail[1] !== String(rowCount)) return fail(DAMAGED);
  return { ok: true, backup, rowCount };
}

// Saving Settings on a fresh phone writes a settings row, which must not block a restore.
export function canRestore(counts: Record<string, number>): boolean {
  return Object.entries(counts).every(([table, n]) => table === 'settings' || n === 0);
}
