# Phase 6a: Settings, Backup and APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app has a Settings tab, a one-file backup that can be restored onto an empty app, the worst leftover rough edges fixed, and an installable APK that runs in the shop with no computer.

**Architecture:**
- New tab `(tabs)/settings.tsx`: currency, default buffer, usage window, theme, shops, backup.
- Nothing writes the `settings` table today, so every reader falls back to `R`, 10 and 3. `saveSettings` writes its one row. The readers don't change.
- The theme lives in a new local-only table, `device_prefs`, because it belongs to one phone. Phase 7 shares `settings` across the household, and the spec's list of shared settings doesn't include theme. `Appearance.setColorScheme` applies it, so `useTheme` doesn't change.
- A backup is one CSV file with a section per table. It is built and checked by pure code in `src/backup/backupFormat.ts`. Database and file access live in `src/backup/backupRepo.ts`.
- The table and column lists come from `AppSchema`, so a table added later is backed up automatically.

**Tech Stack:** The phase 5b stack, plus `expo-file-system`, `expo-sharing` and `expo-document-picker`. These are native modules, so the phone needs a **new dev build** before it can run this phase.

**Spec:** [grocery-app-handover.md](../../../grocery-app-handover.md) sections 6 (screen 7), 7 (phase 6), 8; [2026-10-26-grocery-planner-design.md](../specs/2026-10-26-grocery-planner-design.md) 4.4, 4.5; [2026-10-26-design-restyle-design.md](../specs/2026-10-26-design-restyle-design.md) (theme override). Owner decisions (2026-11-01):
- Phase 6 splits into **6a** (this plan) and **6b** (charts, learning suggestions).
- Backup is **export and full restore onto an empty app**. No merging into existing data.
- The **value-of-time setting is dropped**.

## Global Constraints

- **Settings limits and defaults:**
  - Currency: trimmed, 1 to 3 characters, default `R`.
  - Default buffer: whole number 0 to 100, default 10. Error copy: `Buffer must be a whole number from 0 to 100`. It applies to new items and groups only.
  - Usage window: whole number 1 to 12 months, default 3.
- **Theme:** `'auto' | 'light' | 'dark'`, labelled System, Light, Dark. The default is `auto`. RN 0.88 takes `'auto'` to clear the override, not `null`.
- **Shops:** rename and change city/local. No delete, because purchases and trips point at shops. Duplicate names are refused with `findDuplicate`.
- **Backup file layout:**
  ```
  eekhoring-backup,1
  table,items
  id,name,unit,...
  <rows>
  table,stores
  ...
  end-of-backup,<total row count>
  ```
- **CSV encoding:** RFC 4180 quoting. `null` is an empty unquoted field. An empty string is `""`. Numbers use `String(n)`.
- **File name:** `eekhoring-backup-YYYY-MM-DD.csv`, in the cache folder, overwriting a same-day file.
- **Restore rules:**
  - All or nothing, inside one `db.writeTransaction`.
  - Allowed only when every backup table is empty, except `settings`. A `settings` row is replaced by the backup's, so saving Settings on a fresh phone doesn't block a restore.
  - Values are bound as strings or null. PowerSync's views cast them to the column type.
  - Table and column names come only from the `AppSchema` whitelist, because they are put into SQL text.
- **Export checks itself:** `exportBackup` decodes its own text before sharing and throws if the row count differs.
- **House rules:** no hard-coded colours (guard test), one accent per screen, `createGuard` around writes, money in integer cents, no new dependency beyond the three above.

## Review Focus

1. A file that isn't a backup, or is cut off, is refused with a clear message, and the app's data doesn't change. Test: `decodeBackup rejects …` in Task 3.
2. A backup opened and re-saved in Excel can come back with changed dates, CRLF line endings and a BOM. CRLF and BOM are accepted, changed dates are refused. Test: Task 3.
3. Notes with commas, quotes, line breaks and emoji, plus empty string versus null, come back exactly. Test: the round-trip test in Task 3.
4. Saving Settings on a fresh phone must not block a restore, and restore must leave one `settings` row. Test: `canRestore` in Task 3.
5. A crafted file with a made-up table or column name is refused before any SQL runs. Test: Task 3.

---

### Task 1: New dev build (native modules)

**Files:**
- Modify: `eekhoring/package.json`, `eekhoring/package-lock.json`, `eekhoring/app.json` (whatever `expo install` changes)

- [ ] **Step 1: Branch.** `git checkout -b phase-6a`
- [ ] **Step 2: Install.** In `eekhoring/`, run `npx expo install expo-file-system expo-sharing expo-document-picker`
- [ ] **Step 3: Verify.** Run `npx jest`. Expected: 164 passed.
- [ ] **Step 4: Commit.** `chore: add file system, sharing and document picker modules`
- [ ] **Step 5: Start the build.** Run `npx eas-cli build -p android --profile development --no-wait`, and give the owner the build link. If Claude can't run it, the owner runs it in PowerShell with `npx.cmd`. Building continues while the build queues.

### Task 2: Settings tab and theme

**Files:**
- Create: `eekhoring/src/settings/settingsRules.ts`, `eekhoring/src/settings/settingsRules.test.ts`, `eekhoring/src/settings/settingsRepo.ts`, `eekhoring/src/app/(tabs)/settings.tsx`
- Modify: `eekhoring/src/db/schema.ts` (add `device_prefs`), `eekhoring/src/stores/storeRepo.ts`, `eekhoring/src/app/(tabs)/_layout.tsx`, `eekhoring/src/app/_layout.tsx`

**Interfaces:**
- Consumes: `findDuplicate(name, others, selfId?)`, `addStore`, `STORES_SQL`, `Field`, `SwitchRow`, `PrimaryButton`, `Screen`, `createGuard`.
- Produces: `validateSettings`, `saveSettings`, `saveThemeMode`, `applySavedTheme`, `updateStore`, and the `(tabs)/settings.tsx` screen that Task 4 adds to.

- [ ] **Step 1: Write the failing tests** in `settingsRules.test.ts`:

```ts
const ok = { currency: ' $ ', bufferPct: '15', usageMonths: '6' };
test('validateSettings trims and parses', () =>
  expect(validateSettings(ok)).toEqual({ ok: true, values: { currency: '$', bufferPct: 15, usageMonths: 6 } }));
test.each(['', '   ', 'ABCD'])('validateSettings rejects currency %j', (currency) =>
  expect(validateSettings({ ...ok, currency })).toMatchObject({ ok: false, errors: { currency: expect.any(String) } }));
test.each(['-1', '101', '1.5', 'x', ''])('validateSettings rejects buffer %j', (bufferPct) =>
  expect(validateSettings({ ...ok, bufferPct })).toMatchObject({ ok: false, errors: { bufferPct: 'Buffer must be a whole number from 0 to 100' } }));
test.each(['0', '13', '1.5', 'x', ''])('validateSettings rejects window %j', (usageMonths) =>
  expect(validateSettings({ ...ok, usageMonths })).toMatchObject({ ok: false, errors: { usageMonths: expect.any(String) } }));
```

- [ ] **Step 2: Run them.** `npx jest settingsRules`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `validateSettings(form: { currency: string; bufferPct: string; usageMonths: string })`** in `settingsRules.ts`, returning `{ ok: true, values } | { ok: false, errors }`, the same shape as `validateItem`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Add the table** to `schema.ts` and to `AppSchema`:

```ts
// One phone's preferences, never shared or backed up (phase 7 shares `settings`).
const device_prefs = new Table({ theme_mode: column.text }, { localOnly: true });
```

- [ ] **Step 6: Implement the writes.**
  - `settingsRepo.ts`:
    - `saveSettings(values): Promise<void>`: in one write transaction, `UPDATE settings SET …` (no WHERE), or `INSERT` with a `randomUUID()` id if there are no rows.
    - `saveThemeMode(mode: ThemeMode): Promise<void>`: same update-or-insert on `device_prefs`, then `Appearance.setColorScheme(mode)`.
    - `applySavedTheme(): Promise<void>`: reads `device_prefs` and calls `Appearance.setColorScheme` if a row exists.
  - `storeRepo.ts`: `updateStore(id: string, name: string, isCity: boolean): Promise<void>`.
- [ ] **Step 7: Build the screen.**
  - Add `<Tabs.Screen name="settings" …>` with title `Settings` and icon `cog-outline`.
  - Call `applySavedTheme()` once in a `useEffect` in `RootLayout`.
  - `(tabs)/settings.tsx` is a scrolling screen with sections:
    - **General:** three `Field`s and a Save button. Under the buffer field: `Used for new items and groups.`
    - **Theme:** three `Chip`s that save on tap.
    - **Shops:** list of shops, tap one to edit name and `City shop` switch inline, plus `+ New shop`.
  - Load the form once from the `settings` row, with the defaults above if there is none.
- [ ] **Step 8: Verify.** Run the typed-routes refresh from the Gotchas, then `npx tsc --noEmit`, `npx expo lint`, `npx jest`. Expected: all clean.
- [ ] **Step 9: Commit.** `feat: Settings tab with currency, buffer, usage window, theme and shops`

### Task 3: Backup format (pure)

**Files:**
- Create: `eekhoring/src/backup/backupFormat.ts`, `eekhoring/src/backup/backupFormat.test.ts`

**Interfaces:**
- Produces:
  - `type BackupTable = { columns: string[]; rows: (string | null)[][] }` (`columns[0]` is `id`).
  - `type Backup = Record<string, BackupTable>`.
  - `type KnownTables = Record<string, string[]>` (table name to allowed columns).
  - `encodeBackup(backup: Backup): string`
  - `decodeBackup(text: string, known: KnownTables): { ok: true; backup: Backup; rowCount: number } | { ok: false; error: string }`
  - `canRestore(counts: Record<string, number>): boolean`

- [ ] **Step 1: Write the failing tests** in `backupFormat.test.ts`:

```ts
const known = { items: ['id', 'name', 'notes'], purchases: ['id', 'date', 'quantity'], settings: ['id', 'currency_symbol'] };
const sample = {
  items: { columns: ['id', 'name', 'notes'], rows: [['1', 'Rice, "long" 🍚', 'line\nbreak'], ['2', '', null]] },
  purchases: { columns: ['id', 'date', 'quantity'], rows: [['p1', '2026-11-01T10:00:00.000Z', '0.1']] },
};
const text = encodeBackup(sample);
const bad = (t: string) => decodeBackup(t, known);

test('round trip keeps commas, quotes, line breaks, emoji, and empty versus null', () =>
  expect(decodeBackup(text, known)).toEqual({ ok: true, backup: sample, rowCount: 3 }));
test('decodeBackup accepts CRLF and a BOM', () =>
  expect(decodeBackup('﻿' + text.replace(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\r\n'), known)).toEqual({ ok: true, backup: sample, rowCount: 3 }));
test('decodeBackup rejects a file that is not a backup', () => expect(bad('a,b\n1,2\n')).toMatchObject({ ok: false }));
test('decodeBackup rejects a newer version', () => expect(bad(text.replace('eekhoring-backup,1', 'eekhoring-backup,2'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a cut-off file', () => expect(bad(text.slice(0, text.indexOf('end-of-backup')))).toMatchObject({ ok: false }));
test('decodeBackup rejects a wrong row count', () => expect(bad(text.replace('end-of-backup,3', 'end-of-backup,4'))).toMatchObject({ ok: false }));
test('decodeBackup rejects an unknown table', () => expect(bad(text.replace('table,items', 'table,x; DROP TABLE items'))).toMatchObject({ ok: false }));
test('decodeBackup rejects an unknown column', () => expect(bad(text.replace('id,name,notes', 'id,name,"notes) --"'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a row of the wrong width', () => expect(bad(text.replace('p1,', 'p1,extra,'))).toMatchObject({ ok: false }));
test('decodeBackup rejects a missing id', () =>
  expect(decodeBackup(encodeBackup({ items: { columns: ['id', 'name', 'notes'], rows: [[null, 'x', null]] } }), known)).toMatchObject({ ok: false }));
test('decodeBackup rejects a date changed by a spreadsheet', () =>
  expect(bad(text.replace('2026-11-01T10:00:00.000Z', '01/11/2026'))).toMatchObject({ ok: false, error: expect.stringContaining('another program') }));
test('decodeBackup accepts a table with fewer columns (a backup from an older app)', () =>
  expect(decodeBackup(encodeBackup({ items: { columns: ['id', 'name'], rows: [['1', 'Rice']] } }), known)).toMatchObject({ ok: true, rowCount: 1 }));
test('canRestore ignores settings', () => expect(canRestore({ items: 0, stores: 0, settings: 1 })).toBe(true));
test('canRestore refuses any other data', () => expect(canRestore({ items: 1, stores: 0, settings: 0 })).toBe(false));
```

- [ ] **Step 2: Run them.** `npx jest backupFormat`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `backupFormat.ts` per the Global Constraints. The parser is a character loop, because line breaks inside quotes and the null-versus-`""` difference rule out `split`. Each error is a plain sentence for the owner. A changed date (any `date` column not matching `/^\d{4}-\d{2}-\d{2}/`) reads: `This file was changed by another program, so it can't be restored safely. Use the file as the app shared it.`
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: backup file format with validation`

### Task 4: Export and restore

**Files:**
- Create: `eekhoring/src/backup/backupRepo.ts`
- Modify: `eekhoring/src/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `encodeBackup`, `decodeBackup`, `canRestore` (Task 3), `AppSchema`, `db`.
- Produces: `exportBackup(now: Date): Promise<void>`; `restoreBackup(text: string): Promise<{ ok: true; rowCount: number } | { ok: false; error: string }>`.

- [ ] **Step 1: Implement `backupRepo.ts`.**
  - `knownTables()` builds `KnownTables` from `AppSchema`, leaving out `localOnly` tables, with `id` first.
  - `exportBackup`: `SELECT` each table, convert values to `string | null`, encode, decode the text again and throw if the count differs. Then write with `new File(Paths.cache, name)` and call `Sharing.shareAsync(file.uri, { mimeType: 'text/csv' })`.
  - `restoreBackup`: decode first. Inside one `db.writeTransaction`, count every table, return the `canRestore` refusal if it is false, `DELETE FROM settings`, then insert every row. Refusal copy: `This phone already has data. Restore only works on an empty app.`
- [ ] **Step 2: Add the Backup section** to `settings.tsx`.
  - Copy: `Save this file somewhere off the phone, like Google Drive. Don't edit it in Excel.`
  - `Share backup` button: calls `exportBackup(new Date())`.
  - `Restore from backup` outline button: `DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })` (Android doesn't label CSV files consistently), reads with `new File(uri).text()`, calls `restoreBackup`, then shows an alert with `Restored N rows.` or the error.
  - Both run inside `createGuard`.
- [ ] **Step 3: Verify.** Run `npx tsc --noEmit`, `npx expo lint`, `npx jest`. Expected: all clean. Confirm `file.create({ overwrite: true })` exists in the installed `expo-file-system` types; the docs snippet doesn't show the option.
- [ ] **Step 4: Commit.** `feat: share a backup file and restore it onto an empty app`

### Task 5: Polish

**Files:**
- Modify: `eekhoring/src/purchases/purchaseRules.ts`, `eekhoring/src/purchases/purchaseRules.test.ts` (or the file where its tests live), `eekhoring/src/orders/orderRules.ts`, `eekhoring/src/orders/orderRules.test.ts`, `eekhoring/src/app/purchase/[id].tsx`, `eekhoring/src/app/order/[lineId].tsx`, `eekhoring/src/app/prices/[id].tsx`, `eekhoring/src/app/(tabs)/list.tsx`

**Interfaces:**
- Produces: `maxDeliveredEdit(line: { quantity: number; delivered: number; cancelled_qty: number }, currentQty: number): number`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('formatMoney groups thousands', () => expect(formatMoney(123456789, 'R')).toBe('R1 234 567.89'));
test('formatMoney leaves small amounts', () => expect(formatMoney(99950, 'R')).toBe('R999.50'));
test('formatMoney handles negatives', () => expect(formatMoney(-123456, 'R')).toBe('-R1 234.56'));
test('maxDeliveredEdit allows up to what was ordered', () => expect(maxDeliveredEdit({ quantity: 6, delivered: 4, cancelled_qty: 0 }, 4)).toBe(6));
test('maxDeliveredEdit leaves out what was cancelled', () => expect(maxDeliveredEdit({ quantity: 6, delivered: 4, cancelled_qty: 2 }, 4)).toBe(4));
test('maxDeliveredEdit counts other deliveries', () => expect(maxDeliveredEdit({ quantity: 6, delivered: 5, cancelled_qty: 0 }, 2)).toBe(3));
```

- [ ] **Step 2: Run them.** `npx jest purchaseRules orderRules`. Expected: FAIL. Check whether any current behaviour relies on negative amounts staying as `R-12.00`; if a screen does, keep that form and change the test.
- [ ] **Step 3: Implement both**, using a non-breaking space between thousands so an amount never wraps.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Fix these screens:**
  - `purchase/[id].tsx`: a delivered purchase (`order_line_id` set) can't be saved above `maxDeliveredEdit`. The error is on the quantity field: `Only {max} of this order can be delivered`.
  - `purchase/[id].tsx`: leaving with unsaved edits asks first, using `usePreventRemove` and `allowLeave()` the way `order/[lineId].tsx` does.
  - `order/[lineId].tsx`: a missing line shows `This order line no longer exists` once the query has finished, not `Loading…` forever.
  - `prices/[id].tsx`: show nothing while loading, so `No purchases yet` doesn't flash.
  - `(tabs)/list.tsx`: add a `ListEmptyComponent`, the only list screen without one: `Nothing on your list yet. Tap Make list / Refresh.` First confirm the label matches the button.
- [ ] **Step 6: Verify.** Run `npx tsc --noEmit`, `npx expo lint`, `npx jest`. Expected: all clean.
- [ ] **Step 7: Commit.** `fix: thousands in money, delivered purchase limit, unsaved prompt, loading and empty states`

### Task 6: Review, APK and owner phone check (about 30 minutes, plus build queue)

- [ ] **Step 1: Review.** One fresh reviewer on the most capable model checks the whole branch, with Review Focus in hand. Fix Critical and Important findings with a failing test first.
- [ ] **Step 2: Dev check.** The owner installs the Task 1 dev build, keeping data, and reloads from :8082.
- [ ] **Step 3: Send checks 1 to 5.**
  1. On Settings, set currency to `$` and save. The List and Savings show `$`. Set it back to `R`.
  2. Set default buffer to 20 and save. `+ Add item` prefills 20. Existing items don't change. Set it back.
  3. Tap Dark, then Light, then force-close and reopen. Light is still on. Then tap System.
  4. Rename a shop and save. Its old purchases show the new name. Change it back.
  5. Tap **Share backup** and save the file to Google Drive. Then tap **Restore from backup** and pick it. The app refuses with `This phone already has data…`, and nothing changes.
- [ ] **Step 4: Build the APK.** After checks 1 to 5 pass, run `npx eas-cli build -p android --profile preview --no-wait`, and give the owner the link.
- [ ] **Step 5: Send checks 6 and 7.**
  6. Install the APK over the dev build, then turn on flight mode. With the computer off, the app opens with all your data. If Android refuses to install over the dev build, uninstall the dev build first and restore in check 7.
  7. In Android Settings, clear Eekhoring's storage. Open the app, which is now empty. Tap **Restore from backup**, and pick the check 5 file. The item count, one shop's purchases and the Savings total all match what they were.
- [ ] **Step 6: Finish.** Use `superpowers:finishing-a-development-branch`.
- [ ] **Step 7: Start clean.** The data so far is test data only (owner, 2026-11-01). The owner clears Eekhoring's storage once more and starts entering real data.

## Not in this phase

- **6b:** usage and price-history charts, learning suggestions (handover 5.4), the Scan and Prices tabs decision.
- **Dropped by owner:** value of time.
- **Dropped by the builder:** seed data for testing. The owner's phone already has test data for the checks.
- **Phase 7:** syncing between phones. Backup is not sync. Phase 7 must also decide what restore does once a phone has joined a household.
- **Left as is (deferred minors):** part prices may lose 1 cent; item explanation ignores on-the-way; orders allowed at local shops; `OPEN_ORDERS_SQL` ORDER BY inside a subquery; group on-the-way ignores 50/50 share; "Pick a shop first" shows at the top; new-category cancel; stock-take chip copy, cramped row, long names and filtered count; vector-icons caret pin.

## Gotchas

- Before `tsc`, refresh typed routes: `(CI=1 timeout 60 npx expo start --dev-client --port 8090 > /dev/null 2>&1 || true)`.
- A stale-module crash on the phone means restarting :8082 with `--clear`.
- `Chip` doesn't work with `Link asChild`. `ItemCard` requires `right`. Call `allowLeave()` before `router.back()`.
