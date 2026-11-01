import { canRestore, decodeBackup, encodeBackup } from './backupFormat';

const known = { items: ['id', 'name', 'notes'], purchases: ['id', 'date', 'quantity'], settings: ['id', 'currency_symbol'] };
const sample = {
  items: {
    columns: ['id', 'name', 'notes'],
    rows: [
      ['1', 'Rice, "long" 🍚', 'line\nbreak'],
      ['2', '', null],
    ],
  },
  purchases: { columns: ['id', 'date', 'quantity'], rows: [['p1', '2026-11-01T10:00:00.000Z', '0.1']] },
};
const text = encodeBackup(sample);
const bad = (t: string) => decodeBackup(t, known);

test('round trip keeps commas, quotes, line breaks, emoji, and empty versus null', () =>
  expect(decodeBackup(text, known)).toEqual({ ok: true, backup: sample, rowCount: 3 }));
test('decodeBackup accepts CRLF and a BOM', () =>
  expect(decodeBackup('﻿' + text.replace(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\r\n'), known)).toEqual({ ok: true, backup: sample, rowCount: 3 }));
test('decodeBackup keeps an empty table', () =>
  expect(decodeBackup(encodeBackup({ items: { columns: ['id', 'name'], rows: [] } }), known)).toEqual({
    ok: true,
    backup: { items: { columns: ['id', 'name'], rows: [] } },
    rowCount: 0,
  }));
test('decodeBackup rejects a file that is not a backup', () => expect(bad('a,b\n1,2\n')).toMatchObject({ ok: false }));
test('decodeBackup rejects an empty file', () => expect(bad('')).toMatchObject({ ok: false }));
test('decodeBackup rejects a newer version', () => expect(bad(text.replace('eekhoring-backup,1', 'eekhoring-backup,2'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a cut-off file', () => expect(bad(text.slice(0, text.indexOf('end-of-backup')))).toMatchObject({ ok: false }));
test('decodeBackup rejects an unclosed quote', () => expect(bad(text.slice(0, text.indexOf('break') + 2))).toMatchObject({ ok: false }));
test('decodeBackup rejects a wrong row count', () => expect(bad(text.replace('end-of-backup,3', 'end-of-backup,4'))).toMatchObject({ ok: false }));
test('decodeBackup rejects an unknown table', () => expect(bad(text.replace('table,items', 'table,x; DROP TABLE items'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a repeated table', () =>
  expect(bad(text.replace('table,purchases\nid,date,quantity', 'table,items\nid,date,quantity'))).toMatchObject({ ok: false }));
test('decodeBackup rejects an unknown column', () => expect(bad(text.replace('id,name,notes', 'id,name,"notes) --"'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a repeated column', () => expect(bad(text.replace('id,name,notes', 'id,name,name'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a table without id first', () => expect(bad(text.replace('id,name,notes', 'name,id,notes'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a row of the wrong width', () => expect(bad(text.replace('p1,', 'p1,extra,'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a missing id', () =>
  expect(decodeBackup(encodeBackup({ items: { columns: ['id', 'name', 'notes'], rows: [[null, 'x', null]] } }), known)).toMatchObject({ ok: false }));
test('decodeBackup rejects a date changed by a spreadsheet', () =>
  expect(bad(text.replace('2026-11-01T10:00:00.000Z', '01/11/2026'))).toMatchObject({ ok: false, error: expect.stringContaining('another program') }));
test('decodeBackup allows a blank date', () =>
  expect(decodeBackup(encodeBackup({ purchases: { columns: ['id', 'date'], rows: [['1', null]] } }), known)).toMatchObject({ ok: true }));
test('decodeBackup accepts a table with fewer columns (a backup from an older app)', () =>
  expect(decodeBackup(encodeBackup({ items: { columns: ['id', 'name'], rows: [['1', 'Rice']] } }), known)).toMatchObject({ ok: true, rowCount: 1 }));
test('canRestore ignores settings', () => expect(canRestore({ items: 0, stores: 0, settings: 1 })).toBe(true));
test('canRestore refuses any other data', () => expect(canRestore({ items: 1, stores: 0, settings: 0 })).toBe(false));
