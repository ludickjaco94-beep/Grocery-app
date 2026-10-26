# Phase 2: Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can do a fast stock-take of every active item, add or remove stock by hand, and see each item's count history, with weight items countable in kg or in packs.

**Architecture:** Every `stock_counts` row is the stock level *after* the event (spec 4.1). Current stock = the item's latest row by `date`. Pure rules (parsing counts, applying adjustments, packs to kg, history changes) live in `src/stock/stockRules.ts` and are unit-tested. `src/stock/stockRepo.ts` holds the SQL. Writes go through `createGuard` and `db.writeTransaction`.

**Tech Stack:** Existing phase 1 stack: Expo SDK 58, Expo Router, `@powersync/react-native` (local-only), `expo-crypto`, `jest-expo`. No new dependencies, so no dev-client rebuild.

**Spec:** [docs/superpowers/specs/2026-10-26-grocery-planner-design.md](../specs/2026-10-26-grocery-planner-design.md) (sections 4.1, 4.2) on top of [grocery-app-handover.md](../../../grocery-app-handover.md) (sections 3, 4, 6.3, 7 phase 2).

## Global Constraints

- Offline, local-only. `connect()` is never called.
- All ids are UUIDs from `expo-crypto` `randomUUID()`.
- `stock_counts.source` is one of `'stocktake' | 'adjustment' | 'purchase'`. Phase 2 writes only the first two.
- `stock_counts.date` is a full ISO timestamp (`new Date().toISOString()`). All rows from one stock-take share one timestamp.
- Quantities are decimals rounded to 3 places (`Math.round(n * 1000) / 1000`). Stock is never negative.
- Weight items (`sold_by_weight = 1`): the count is always saved in kg. Packs mode converts with average kg per pack = Σ purchase kg / Σ `pack_count` over that item's purchases in the last `settings.usage_window_months` months (default 3 when settings has no row). Packs mode saves `entered_packs`. With no pack-count data, packs mode is disabled with the hint **"log pack counts on purchases to enable"**.
- Stock counts are never hard-deleted (spec 4.1).
- Android back works on every screen. Leaving with unsaved stock-take changes asks "Discard this stock-take?" and does not block back.
- Commands for the owner: PowerShell uses `npx.cmd`, not `npx`.

## Review Focus

1. **Untouched rows:** an item counted last month and skipped this time must not be counted as zero. Expect: rows start with the last count, blank rows (never counted) are skipped, never saved as 0. → Task 2 test `blank rows are skipped, not zero`.
2. **Removing more than you have:** remove 3 when stock is 2. Expect a clear error and no row written, not a negative level. → Task 2 test `remove below zero is an error`.
3. **Float noise:** 0.1 + 0.2 kg must show and save as 0.3, not 0.30000000000000004. → Task 2 test `adjustment rounds to 3 decimals`.
4. **Half-typed numbers:** `.5`, `,5` and `2,` on the phone keyboard. Expect 0.5, 0.5 and 2, not "invalid". → Task 1 test `parseDecimal accepts leading and trailing separators`.
5. **Packs typed as decimals:** `1.5` packs in packs mode. Expect an error "Packs must be a whole number", not a silent conversion. → Task 2 test `packs must be whole`.

---

### Task 1: Fix the input parser and the deferred item-screen minors

**Files:**
- Modify: `eekhoring/src/items/itemRules.ts` (`parseDecimal`, cap error in `validateItem`)
- Modify: `eekhoring/src/app/item/[id].tsx` (query error before "Item not found")
- Test: `eekhoring/src/items/itemRules.test.ts`

**Interfaces:**
- Produces: `parseDecimal(s: string): number | null | 'invalid'` (same signature, wider accepted input). Task 2 uses it.

- [ ] **Step 1: Write the failing tests** in `itemRules.test.ts`:

```ts
test('parseDecimal accepts leading and trailing separators', () => {
  expect(parseDecimal('.5')).toBe(0.5);
  expect(parseDecimal(',5')).toBe(0.5);
  expect(parseDecimal('2,')).toBe(2);
  expect(parseDecimal('.')).toBe('invalid');
  expect(parseDecimal('1.2.3')).toBe('invalid');
});

test('cap error has no float noise', () => {
  const r = validateItem({ ...emptyItemForm, name: 'Rice', bufferPct: '7', maxMonthsCover: '1' });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.maxMonthsCover).toBe('Cap must be at least 1.07 months to cover the 7% buffer');
});
```

- [ ] **Step 2:** Run `npm test -- itemRules`. Expected: the 2 new tests FAIL.
- [ ] **Step 3:** In `parseDecimal`, change the regex to `/^-?(\d+\.?\d*|\.\d+)$/`. In the cap check and message, use `(100 + buffer) / 100` instead of `1 + buffer / 100`.
- [ ] **Step 4:** In `ItemEditScreen`, before the `!item` check, add: `if (!isNew && existing.error) return <Text style={styles.loading}>Could not load item: {existing.error.message}</Text>;`
- [ ] **Step 5:** Run `npm test`. Expected: all pass (16 old + 2 new).
- [ ] **Step 6: Commit**

```bash
git add src/items src/app/item
git commit -m "fix: accept .5 and 2, decimals, clean cap error, show item load errors"
```

### Task 2: Stock rules

**Files:**
- Create: `eekhoring/src/stock/stockRules.ts`
- Test: `eekhoring/src/stock/stockRules.test.ts`

**Interfaces:**
- Consumes: `parseDecimal` (Task 1).
- Produces (all exported from `stockRules.ts`):
  - `roundQty(n: number): number`: 3 decimals.
  - `stepFor(unit: Unit): number`: `0.5` for `'kg'`, `1` otherwise.
  - `type CountRow = { itemId: string; text: string; packs: boolean; kgPerPack: number | null }`
  - `type CountEntry = { item_id: string; quantity: number; entered_packs: number | null }`
  - `buildStockTake(rows: CountRow[]): { ok: true; entries: CountEntry[]; skipped: number } | { ok: false; errors: Record<string, string> }`
  - `applyAdjustment(current: number, delta: number): number | { error: string }`
  - `usageWindowStart(now: Date, months: number): string`: ISO timestamp `months` calendar months before `now`.
  - `type HistoryRow = { id: string; date: string; quantity: number; source: string; entered_packs: number | null }`
  - `withChanges(rowsOldestFirst: HistoryRow[]): (HistoryRow & { change: number | null })[]`: newest first. `change` = this level minus the previous row's level, `null` for the first row.

- [ ] **Step 1: Write the failing tests** in `stockRules.test.ts`:

```ts
const row = (o: Partial<CountRow>): CountRow => ({ itemId: 'a', text: '', packs: false, kgPerPack: null, ...o });

test('blank rows are skipped, not zero', () => {
  const r = buildStockTake([row({ itemId: 'a', text: '' }), row({ itemId: 'b', text: '0' }), row({ itemId: 'c', text: '2,5' })]);
  expect(r).toEqual({ ok: true, skipped: 1, entries: [
    { item_id: 'b', quantity: 0, entered_packs: null },
    { item_id: 'c', quantity: 2.5, entered_packs: null },
  ] });
});

test('negative and junk counts are errors per row', () => {
  const r = buildStockTake([row({ itemId: 'a', text: '-1' }), row({ itemId: 'b', text: 'x' })]);
  expect(r).toEqual({ ok: false, errors: { a: 'Count must be 0 or more', b: 'Count must be 0 or more' } });
});

test('packs convert to kg and keep the pack count', () => {
  const r = buildStockTake([row({ text: '3', packs: true, kgPerPack: 0.45 })]);
  expect(r).toEqual({ ok: true, skipped: 0, entries: [{ item_id: 'a', quantity: 1.35, entered_packs: 3 }] });
});

test('packs must be whole', () => {
  const r = buildStockTake([row({ text: '1.5', packs: true, kgPerPack: 0.5 })]);
  expect(r).toEqual({ ok: false, errors: { a: 'Packs must be a whole number' } });
});

test('packs mode without pack data is an error', () => {
  const r = buildStockTake([row({ text: '2', packs: true, kgPerPack: null })]);
  expect(r).toEqual({ ok: false, errors: { a: 'log pack counts on purchases to enable' } });
});

test('adjustment rounds to 3 decimals', () => {
  expect(applyAdjustment(0.1, 0.2)).toBe(0.3);
});

test('remove below zero is an error', () => {
  expect(applyAdjustment(2, -3)).toEqual({ error: 'You only have 2. You cannot remove 3.' });
  expect(applyAdjustment(2, -2)).toBe(0);
});

test('usageWindowStart goes back calendar months', () => {
  expect(usageWindowStart(new Date('2026-10-26T10:00:00.000Z'), 3)).toBe('2026-07-26T10:00:00.000Z');
});

test('withChanges is newest first with the change from the row before', () => {
  const h = (id: string, quantity: number) => ({ id, date: id, quantity, source: 'stocktake', entered_packs: null });
  expect(withChanges([h('1', 4), h('2', 6), h('3', 1)]).map((r) => [r.id, r.change])).toEqual([['3', -5], ['2', 2], ['1', null]]);
});
```

- [ ] **Step 2:** Run `npm test -- stockRules`. Expected: FAIL, cannot find module `./stockRules`.
- [ ] **Step 3:** Implement `stockRules.ts` with the signatures above. Packs mode quantity = `roundQty(packs * kgPerPack)`. Error copy is exactly as in the tests. Build the `applyAdjustment` error message from the removed amount (`-delta`).
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add src/stock
git commit -m "feat: stock rules for counts, adjustments, packs and history"
```

### Task 3: Stock repository

**Files:**
- Create: `eekhoring/src/stock/stockRepo.ts`

**Interfaces:**
- Consumes: `db` from `@/db/db`; `CountEntry`, `applyAdjustment`, `usageWindowStart` (Task 2).
- Produces:
  - `CURRENT_STOCK_SQL: string`: selects `item_id, quantity` of each item's latest row. Use `WHERE date = (SELECT MAX(date) FROM stock_counts WHERE item_id = s.item_id)` on `stock_counts s`.
  - `KG_PER_PACK_SQL: string`: selects `item_id, SUM(quantity) * 1.0 / SUM(pack_count) AS kg_per_pack FROM purchases WHERE pack_count > 0 AND date >= ? GROUP BY item_id`. Parameter: `usageWindowStart(new Date(), months)`.
  - `saveStockTake(entries: CountEntry[]): Promise<void>`: one `db.writeTransaction`, one shared `new Date().toISOString()`, one `INSERT` per entry with `source = 'stocktake'`.
  - `adjustStock(itemId: string, delta: number): Promise<void>`: inside `db.writeTransaction`, read the current level (`0` when the item has no rows), call `applyAdjustment`, `throw new Error(result.error)` on error, otherwise insert a row with `source = 'adjustment'`, `entered_packs = null`.

- [ ] **Step 1:** Implement `stockRepo.ts` following `itemRepo.ts` style. It has no unit tests (phase 1 kept repos untested). The phone checks in Task 6 cover it.
- [ ] **Step 2:** Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit**

```bash
git add src/stock/stockRepo.ts
git commit -m "feat: stock repository"
```

### Task 4: Stock-take screen

**Files:**
- Create: `eekhoring/src/app/stocktake.tsx`
- Modify: `eekhoring/src/app/index.tsx` (a "Stock-take" button next to "+ Add item", and current stock in each row's meta line, e.g. `3 left`)

**Interfaces:**
- Consumes: `CURRENT_STOCK_SQL`, `KG_PER_PACK_SQL`, `saveStockTake` (Task 3); `buildStockTake`, `stepFor`, `roundQty`, `CountRow` (Task 2); `parseDecimal` (Task 1); `createGuard`; `usePreventRemove` from `expo-router`.

- [ ] **Step 1:** Build the screen (title "Stock-take"): a `SectionList` of active items grouped by category (same grouping and ordering as `index.tsx`). Each row has the name and unit, a `−` button, a decimal `TextInput`, and a `+` button. Buttons are at least 48×48 with `accessibilityLabel`s like `"Less Rice"` and `"More Rice"`. Weight items also get a `kg | packs` toggle. Packs is disabled when `kgPerPack` is null, and the row then shows the hint text from Global Constraints.
- [ ] **Step 2:** Initial text = the item's current stock as a string, or `''` if it was never counted. `+`/`−` change the parsed value by `stepFor(unit)` (step 1 in packs mode), clamp at 0, and round with `roundQty`. On blank text, `+` starts from 0.
- [ ] **Step 3:** "Save stock-take" runs `buildStockTake` under `createGuard`. On errors: show each row's message under that row, plus `Alert.alert('Fix the rows marked red')`. On ok: `saveStockTake(entries)`, then `Alert.alert('Saved', `${entries.length} counts saved${skipped ? `, ${skipped} blank skipped` : ''}`)`, then `router.back()`.
- [ ] **Step 4:** `dirty` = any row's text or mode differs from its initial value. Call `usePreventRemove(dirty && !saved, ...)` with a confirm "Discard this stock-take?" offering Keep counting / Discard. Discard dispatches the blocked action.
- [ ] **Step 5:** In `index.tsx`, join current stock in the items query with `LEFT JOIN (${CURRENT_STOCK_SQL}) cs ON cs.item_id = items.id`, and add `${quantity} left` to the meta parts when it isn't null. Add the Stock-take button linking to `/stocktake`.
- [ ] **Step 6:** Run `npx tsc --noEmit`, `npx expo lint` and `npm test`. Expected: all clean.
- [ ] **Step 7: Commit**

```bash
git add src/app
git commit -m "feat: stock-take screen and stock on items list"
```

### Task 5: Item stock screen (manual add/remove and history)

**Files:**
- Create: `eekhoring/src/app/stock/[id].tsx`
- Modify: `eekhoring/src/app/item/[id].tsx` (a "Stock & history" link for existing items, above Archive)

**Interfaces:**
- Consumes: `adjustStock` (Task 3); `withChanges`, `HistoryRow`, `roundQty` (Task 2); `parseDecimal`; `createGuard`.

- [ ] **Step 1:** Build the screen (title = item name). The top shows `Now: {level} {unit}`, or `Not counted yet`. Below that: an amount `TextInput` and two buttons, **Add** and **Remove**. They call `adjustStock(id, +amount)` / `adjustStock(id, -amount)` under `createGuard`, with the error alert titled "Could not change stock". An amount that is blank, invalid or ≤ 0 shows `Enter an amount more than 0` inline and writes nothing. Clear the field after a successful write.
- [ ] **Step 2:** History: query `SELECT id, date, quantity, source, entered_packs FROM stock_counts WHERE item_id = ? ORDER BY date`, pass it through `withChanges`, and render a `FlatList`. Each row shows the local date and time (`toLocaleString()`), a label (`Stock-take` / `Added 2` / `Removed 1`, using `Math.abs(change)` for adjustments), the level, and `(3 packs)` when `entered_packs` isn't null. Empty state: `No counts yet. Do a stock-take or add stock above.`
- [ ] **Step 3:** In `item/[id].tsx`, for existing items, add a `Link` to `/stock/${id}` labelled "Stock & history".
- [ ] **Step 4:** Run `npx tsc --noEmit`, `npx expo lint` and `npm test`. Expected: all clean.
- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat: item stock screen with add, remove and count history"
```

### Task 6: Verify, review, phone check

- [ ] **Step 1:** Run `npm test`, `npx tsc --noEmit`, `npx expo lint` and `npx expo-doctor`. Expected: all pass and clean. Paste the counts.
- [ ] **Step 2:** One fresh reviewer (most capable model) reviews `git diff phase-1..phase-2` against this plan. Fix what it confirms, then re-run Step 1.
- [ ] **Step 3:** Start `npx expo start --dev-client` (without `CI=1`). Owner phone checks (no rebuild needed, since there are no new native modules):
  1. Items list shows a **Stock-take** button. Open it: every active item is listed, grouped by category.
  2. Count 3 items using + / −, type `2,5` into a kg item, and leave one item blank. Save. The alert says the right number saved and 1 blank skipped.
  3. The items list shows `N left` for the counted items. The blank one shows nothing.
  4. Open a kg item's stock-take row. **packs** is greyed out with "log pack counts on purchases to enable".
  5. Change a count, press Android back, and choose **Keep counting**: the count is still there. Press back again and choose **Discard**: you leave the screen.
  6. Item → **Stock & history**: add 2, then remove 1. The level and history update right away. Remove more than you have: the error appears and the level doesn't change.
  7. Force-close the app and reopen it. Counts and history are still there.
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch.
