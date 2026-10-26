# Phase 1: Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Expo app on the owner's Android phone (via Expo Go) with the full local database schema and a working Items screen: add, rename, archive/unarchive, buy mode, unit, sold-by-weight.

**Architecture:** Expo Router app in `eekhoring/`. PowerSync is the local SQLite database, local-only (never calls `connect()` in this phase). Pure item rules live in `src/items/itemRules.ts` and are unit-tested; screens call a thin repository that runs SQL.

**Tech Stack:** Expo (latest SDK at install time) + TypeScript, Expo Router, `@powersync/react-native`, `@powersync/react`, `@powersync/adapter-sql-js` (Expo Go), `@op-engineering/op-sqlite` (dev builds/APK), `expo-crypto` (UUIDs), `jest-expo`.

**Spec:** [docs/superpowers/specs/2026-10-26-eekhoring-design.md](../specs/2026-10-26-eekhoring-design.md) on top of [grocery-app-handover.md](../../../grocery-app-handover.md).

## Global Constraints

- One user, one phone, offline. No accounts, no network calls in this phase.
- All `id` values are UUID text generated on the phone.
- Money is integer cents. Quantities are decimals (kg to 3 decimals).
- Renaming edits only `items.name`; history links by `id`. Items are archived (`active = 0`), never deleted.
- Item defaults: `buffer_pct` 10, `max_months_cover` 2, `buy_mode` `'monthly'`.
- `sold_by_weight = 1` forces `unit = 'kg'` and `pack_size = null`.
- Units: `kg`, `L`, `pack`, `each`.
- Android back button works on every screen (Expo Router stack handles it; never block it).
- The owner is not a developer: every command the owner must run is explained in plain words when handed over.

## Review Focus

1. **Comma decimals:** the owner uses rand (South Africa), so the keyboard may type `1,5`. Expect it to be read as 1.5, not rejected or read as 15. → Task 3 test `parseDecimal accepts comma`.
2. **Blank optional numbers:** blank monthly estimate must save as `null` ("needs data"), never `0`. → Task 3 test `blank estimate is null`.
3. **Cap below buffer:** `max_months_cover` less than `1 + buffer_pct/100` makes the buy formula's upper bound smaller than its target. Expect a clear error. → Task 3 test `cap must cover buffer`.
4. **Duplicate names:** `" Milk "` and `"milk"` both active. Expect a trimmed name and a warning, not a silent duplicate. → Task 3 test `findDuplicate is case-insensitive and trims`.
5. **Data survives restart in Expo Go:** the sql.js adapter must persist to a file. Expect items to still be there after force-closing Expo Go. → Task 6 manual check 5.

---

### Task 1: Project, git and test runner

**Files:**
- Create: `eekhoring/` (via create-expo-app), `.gitignore` at the project root
- Modify: `eekhoring/package.json` (add `"test": "jest"` script and `"jest": { "preset": "jest-expo" }`)
- Test: `eekhoring/src/smoke.test.ts`

- [ ] **Step 1:** From the project root run `npx create-expo-app@latest eekhoring`, then in `eekhoring/` run `npm run reset-project` (answer `n` to keep no example files) to get a blank Expo Router app.
- [ ] **Step 2:** Run `npx expo install jest-expo jest @types/jest -- --save-dev`. Add the `test` script and the jest preset to `package.json`.
- [ ] **Step 3:** Write `src/smoke.test.ts` with `test('runs', () => expect(1 + 1).toBe(2))`.
- [ ] **Step 4:** Run `npm test`. Expected: 1 passed.
- [ ] **Step 5:** `git init` at the project root (not inside `eekhoring/`). Root `.gitignore`: `node_modules/`, `.expo/`, `*.apk`, `android/`, `ios/`. Commit the handover, the spec, this plan and the app:

```bash
git add -A
git commit -m "chore: scaffold Expo app, specs and plan"
```

- [ ] **Step 6:** Run `npx expo start`. Owner scans the QR code with Expo Go. Expected: blank screen with the app's default text, no red error.

### Task 2: Local database

**Files:**
- Create: `eekhoring/src/db/schema.ts`, `eekhoring/src/db/db.ts`
- Modify: `eekhoring/app/_layout.tsx`

**Interfaces:**
- Produces: `AppSchema`, `type Database = (typeof AppSchema)['types']`, `type ItemRecord = Database['items']`, and `export const db: PowerSyncDatabase` from `src/db/db.ts`. `app/_layout.tsx` wraps the Stack in `<PowerSyncContext.Provider value={db}>` so screens can use `useQuery` from `@powersync/react`.

- [ ] **Step 1:** `npx expo install @powersync/react-native @powersync/react @powersync/adapter-sql-js @op-engineering/op-sqlite expo-constants expo-crypto`.
- [ ] **Step 2:** In `schema.ts` define every table from the spec now (PowerSync has no migrations; later phases use them as-is). `id` is automatic. Booleans are `column.integer` 0/1. Dates are ISO text.

| Table | Columns |
|---|---|
| `items` | `name` text, `unit` text, `category` text, `buy_mode` text, `buffer_pct` integer, `max_months_cover` real, `est_monthly_usage` real, `pack_size` real, `sold_by_weight` integer, `active` integer, `created_at` text |
| `stores` | `name` text, `is_city` integer, `notes` text |
| `purchases` | `item_id` text, `store_id` text, `date` text, `quantity` real, `total_price_cents` integer, `trip_id` text, `is_emergency` integer, `is_special` integer, `regular_price_cents` integer, `special_note` text, `pack_count` integer |
| `stock_counts` | `item_id` text, `date` text, `quantity` real, `source` text, `entered_packs` integer |
| `trips` | `date` text, `store_id` text, `fuel_cents` integer, `toll_cents` integer, `parking_cents` integer, `other_cents` integer, `notes` text |
| `settings` | `currency_symbol` text, `default_buffer_pct` integer, `usage_window_months` integer |
| `list_entries` | `item_id` text, `quantity` real, `added_manually` integer, `ticked` integer, `ticked_at` text, `ticked_by` text |

Indexes: `item_id` on `purchases`, `stock_counts`, `list_entries`.

- [ ] **Step 3:** In `db.ts` create the single `PowerSyncDatabase` using the adapter switch from PowerSync's Expo Go docs: `Constants.executionEnvironment === 'storeClient'` → `{ factory: new SQLJSOpenFactory({ dbFilename: 'eekhoring.db' }) }`, else `{ database: { dbFilename: 'eekhoring.db' } }`. Do not call `connect()`.
- [ ] **Step 4:** Wire the provider in `app/_layout.tsx`. Temporarily render the result of `useQuery('SELECT count(*) AS n FROM items')` on the home screen.
- [ ] **Step 5:** Reload in Expo Go. Expected: shows `0`, no red error. Remove the temporary count.
- [ ] **Step 6:** Commit: `git commit -am "feat: local PowerSync database with full schema"` (add new files first).

### Task 3: Item rules (pure logic, TDD)

**Files:**
- Create: `eekhoring/src/items/itemRules.ts`
- Test: `eekhoring/src/items/itemRules.test.ts`

**Interfaces:**
- Produces:

```ts
export type Unit = 'kg' | 'L' | 'pack' | 'each';
export type BuyMode = 'monthly' | 'as_needed';
export type ItemForm = { name: string; unit: Unit; category: string; buyMode: BuyMode; soldByWeight: boolean;
  bufferPct: string; maxMonthsCover: string; estMonthlyUsage: string; packSize: string };
export type ItemValues = { name: string; unit: Unit; category: string; buy_mode: BuyMode; sold_by_weight: 0 | 1;
  buffer_pct: number; max_months_cover: number; est_monthly_usage: number | null; pack_size: number | null };
export function parseDecimal(s: string): number | null | 'invalid';
export function validateItem(f: ItemForm): { ok: true; values: ItemValues } | { ok: false; errors: Partial<Record<keyof ItemForm, string>> };
export function findDuplicate(name: string, others: { id: string; name: string }[], selfId?: string): { id: string; name: string } | undefined;
export const emptyItemForm: ItemForm; // unit 'each', buyMode 'monthly', bufferPct '10', maxMonthsCover '2', others ''
```

- [ ] **Step 1: Write the failing tests**

```ts
test('parseDecimal accepts comma', () => expect(parseDecimal('1,5')).toBe(1.5));
test('parseDecimal accepts dot and spaces', () => expect(parseDecimal(' 2.25 ')).toBe(2.25));
test('parseDecimal blank is null', () => expect(parseDecimal('  ')).toBeNull());
test('parseDecimal rejects junk', () => expect(parseDecimal('1.2.3')).toBe('invalid'));
test('name required and trimmed', () => {
  expect(validateItem({ ...emptyItemForm, name: '  ' })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
  expect(validateItem({ ...emptyItemForm, name: ' Milk ' })).toMatchObject({ ok: true, values: { name: 'Milk' } });
});
test('blank estimate is null', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Rice' })).toMatchObject({ ok: true, values: { est_monthly_usage: null, pack_size: null } }));
test('weight forces kg and clears pack size', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Mince', unit: 'pack', soldByWeight: true, packSize: '6' }))
    .toMatchObject({ ok: true, values: { unit: 'kg', sold_by_weight: 1, pack_size: null } }));
test('cap must cover buffer', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Oil', bufferPct: '20', maxMonthsCover: '1.1' }))
    .toMatchObject({ ok: false, errors: { maxMonthsCover: expect.any(String) } }));
test('negative estimate rejected', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Oil', estMonthlyUsage: '-1' })).toMatchObject({ ok: false, errors: { estMonthlyUsage: expect.any(String) } }));
test('buffer must be whole 0-100', () =>
  expect(validateItem({ ...emptyItemForm, name: 'Oil', bufferPct: '150' })).toMatchObject({ ok: false, errors: { bufferPct: expect.any(String) } }));
test('findDuplicate is case-insensitive and trims', () => {
  const others = [{ id: 'a', name: 'Milk' }];
  expect(findDuplicate(' milk ', others)?.id).toBe('a');
  expect(findDuplicate('milk', others, 'a')).toBeUndefined();
});
```

- [ ] **Step 2:** Run `npm test -- itemRules`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement the module. Rules: name trimmed and non-empty; blank category saves as `'Other'`; `bufferPct` whole number 0–100; `maxMonthsCover` > 0 and ≥ `1 + bufferPct/100`; `estMonthlyUsage` blank or ≥ 0; `packSize` blank or > 0; error messages are short plain English (e.g. "Cap must be at least 1.2 months to cover the 20% buffer").
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `git commit -m "feat: item validation rules"`.

### Task 4: Item repository

**Files:**
- Create: `eekhoring/src/items/itemRepo.ts`

**Interfaces:**
- Consumes: `db` (Task 2), `ItemValues` (Task 3).
- Produces: `createItem(v: ItemValues): Promise<string>` (returns new id), `updateItem(id: string, v: ItemValues): Promise<void>`, `setItemActive(id: string, active: boolean): Promise<void>`.

- [ ] **Step 1:** Implement with `db.execute`. `createItem` generates the id with `Crypto.randomUUID()` from `expo-crypto`, sets `active = 1` and `created_at = new Date().toISOString()`. `updateItem` never touches `id`, `active` or `created_at`.
- [ ] **Step 2:** Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3:** Commit: `git commit -m "feat: item repository"`.

No unit test here: it is three SQL statements, and a mocked database would only test the mock. Task 6 checks it on the phone.

### Task 5: Items screens

**Files:**
- Modify: `eekhoring/app/index.tsx` (Items list)
- Create: `eekhoring/app/item/[id].tsx` (add when `id === 'new'`, else edit)

**Interfaces:**
- Consumes: `useQuery` (`@powersync/react`), `itemRules` (Task 3), `itemRepo` (Task 4).

- [ ] **Step 1: List screen.** Search box (filters by name, case-insensitive, in SQL with `LIKE`). Toggle "Show archived". Rows grouped by category, sorted by name, showing name, unit, and a "by weight" or "as needed" tag where relevant. Archived rows are greyed. "+ Add item" button opens `/item/new`. Tapping a row opens `/item/<id>`. Empty state: "No items yet. Tap + Add item to start."
- [ ] **Step 2: Edit screen.** Fields from `ItemForm`. Unit picker is hidden and shows "kg" when "Sold by weight" is on; pack size is hidden then. Category is free text with existing categories offered as tap-to-fill chips. Decimal inputs use `keyboardType="decimal-pad"`. Validation errors show under each field. On save, if `findDuplicate` returns a match, show "You already have <name>. Save anyway?" with Save / Cancel. Save goes back. On an existing item, an "Archive" button (or "Restore" when archived) calls `setItemActive` and goes back. New items take `buffer_pct` default from `settings.default_buffer_pct` if a settings row exists, else 10.
- [ ] **Step 3:** Run `npx tsc --noEmit` and `npm test`. Expected: no errors, all pass.
- [ ] **Step 4:** Commit: `git commit -m "feat: items list and edit screens"`.

### Task 6: Phone check and handover

- [ ] **Step 1:** `npx expo start`; owner opens it in Expo Go. Run this checklist on the phone. Each line must pass:
  1. Add 3 items: "Milk" (each, monthly), "Mince" (sold by weight), "Birthday candles" (pack, as needed). All appear under their categories.
  2. Rename "Milk" to "Long-life milk". The list updates; nothing else changes.
  3. Type `1,5` in "Monthly estimate". It saves and shows 1.5 when reopened.
  4. Archive "Birthday candles": it disappears; "Show archived" shows it greyed; Restore brings it back.
  5. Force-close Expo Go, reopen the app. All items are still there.
  6. Android back button returns from the edit screen to the list without saving.
  7. Adding "milk" again shows the duplicate warning.
- [ ] **Step 2:** Fix anything that fails, rerun `npm test`, commit: `git commit -am "fix: phase 1 phone check"` (only if changes were needed).
- [ ] **Step 3:** Tell the owner in plain words what now works and how to start it again tomorrow (`cd eekhoring`, `npx expo start`, scan the QR).
