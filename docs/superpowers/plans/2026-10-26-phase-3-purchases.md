# Phase 3: Purchases & Stores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the shop, the owner picks the shop and date once, then logs item after item with quantity, price and the Special toggle. Purchases add to stock and can be edited or deleted. Each item shows its price history per shop, with specials badged.

**Architecture:**
- Pure rules (money parsing, validation, unit and normal price, how a purchase changes stock, day handling) live in `src/purchases/purchaseRules.ts` and are unit-tested.
- `src/purchases/purchaseRepo.ts` writes the purchase row and its stock row in one `writeTransaction`.
- One `PurchaseForm` component serves both adding and editing.
- New screens: `/purchases` (the shop list), `/purchase/[id]` (edit) and `/prices/[id]` (price history). All use the phase 2.5 theme and components.

**Tech Stack:** The phase 2.5 stack. No new dependencies. The date is chosen with an in-app day stepper, not a native date picker, so there's no dev-client rebuild.

**Spec:** [grocery-app-handover.md](../../../grocery-app-handover.md) sections 4, 5.6, 6 and 7 (phase 3); [docs/superpowers/specs/2026-10-26-grocery-planner-design.md](../specs/2026-10-26-grocery-planner-design.md) 4.1 and 4.2; [DESIGN_SPEC.md](../../../DESIGN_SPEC.md) for the look. Owner decisions (2026-10-26): log as a running **shop list** (shop and date picked once), and purchases can be **edited or deleted**.

## Global Constraints

- Money is integer cents. Unit price = `total_price_cents / quantity`, shown per kg for weight items. The currency symbol comes from `settings.currency_symbol`, default `R`.
- Purchase fields as in the schema: `item_id, store_id, date, quantity, total_price_cents, trip_id (null in phase 3), is_emergency, is_special, regular_price_cents (normal price per unit or per kg, nullable), special_note, pack_count`.
- `purchases.date` is a full ISO timestamp. It defaults to now. Choosing another day keeps the current time of day. Future days are not allowed.
- Store and date are required. A store row has `name`, `is_city` and `notes`. Store names are unique ignoring case.
- **Normal price** of an item at a store = the median unit price of its last 3 non-special purchases there. With fewer than 3, it's the most recent non-special one. With none, it's `null`. A special price is never a normal price.
- **Stock:** a purchase changes stock only if it's dated after the item's latest stock-take. If no stock-take exists yet, it always changes stock. A stock-take already counted anything bought before it. The change is written as a new `stock_counts` row: the new level (never below 0), dated now, with source `'purchase'` when adding and `'adjustment'` when editing or deleting.
- Weight items: price is always the total paid, with the price per kg shown live, plus an optional whole `pack_count` (spec 4.2). Other items: the price is entered as a total or per unit, at the owner's choice.
- The Special toggle is off by default. When it's on, it shows an optional normal price (per unit or per kg) and an optional note. The Emergency toggle is off by default.
- Only one accent element per screen: **Log purchases** on the Stock screen. Everything else uses the theme from `src/theme`, with no colour literals (the guard test enforces this).
- `Link asChild` children take a single style object. No tab bar yet.
- Owner commands in PowerShell use `npx.cmd`.

## Review Focus

1. **Backdated purchase:** logging yesterday's bread after today's stock-take must not raise stock, because the stock-take already counted it. → Task 1 test `stockDelta ignores purchases before the last stock-take`.
2. **Deleting a purchase that's partly used:** you bought 5, used 3, then delete the purchase. Stock goes to 0, not −3. → Task 1 test `applyStockDelta never goes below zero`.
3. **How prices get typed:** `12,50`, `R12.50`, `R 12` and `.5` must be read as 1250, 1250, 1200 and 50 cents. `12.555` is rejected. → Task 1 test `parseMoney`.
4. **Per-unit rounding:** 3 at R3.33 each is R9.99 total, with no float noise. → Task 1 test `per-unit price builds the total in cents`.
5. **Specials never set the normal price:** a special at R10 after normals of R12, R13 and R14 still gives a normal price of R13. → Task 1 test `normalPrice ignores specials`.

---

### Task 1: Purchase rules

**Files:**
- Create: `eekhoring/src/purchases/purchaseRules.ts`
- Test: `eekhoring/src/purchases/purchaseRules.test.ts`

**Interfaces:**
- Consumes: `parseDecimal` (items), `roundQty` (stock).
- Produces:
  - `parseMoney(s: string): number | null | 'invalid'`. Returns cents. Strips leading currency text and spaces, and accepts a comma or dot. More than 2 decimals or a negative is `'invalid'`. Blank is `null`.
  - `formatMoney(cents: number, symbol: string): string`, e.g. `R12.50`.
  - `type PurchaseFormState = { quantity: string; priceMode: 'total' | 'unit'; price: string; special: boolean; normalPrice: string; note: string; emergency: boolean; packs: string }`, plus `emptyPurchaseForm` (priceMode `'total'`, everything else blank or false).
  - `type PurchaseValues = { quantity: number; total_price_cents: number; is_special: 0 | 1; regular_price_cents: number | null; special_note: string | null; is_emergency: 0 | 1; pack_count: number | null }`
  - `validatePurchase(f: PurchaseFormState, soldByWeight: boolean): { ok: true; values: PurchaseValues } | { ok: false; errors: Partial<Record<keyof PurchaseFormState, string>> }`
  - `purchaseToForm(v: PurchaseValues): PurchaseFormState` (priceMode `'total'`)
  - `unitPriceCents(totalCents: number, quantity: number): number` (not rounded)
  - `normalPrice(rows: { date: string; quantity: number; total_price_cents: number; is_special: number }[]): number | null` (rounded cents)
  - `stockDelta(old: { date: string; quantity: number } | null, next: { date: string; quantity: number } | null, lastStocktake: string | null): number`
  - `applyStockDelta(current: number, delta: number): number`: `roundQty(Math.max(0, current + delta))`
  - `shiftDay(iso: string, days: number, now: Date): string`: same time of day, capped at `now`.
  - `dayLabel(iso: string, now: Date): string`: `'Today'`, `'Yesterday'`, otherwise `toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })`.
  - `dayRange(iso: string): [string, string]`: ISO local midnight to the next local midnight.

- [ ] **Step 1: Write the failing tests** in `purchaseRules.test.ts`:

```ts
import {
  applyStockDelta, dayLabel, dayRange, emptyPurchaseForm, normalPrice, parseMoney, purchaseToForm,
  shiftDay, stockDelta, validatePurchase,
} from './purchaseRules';

test('parseMoney', () => {
  expect(parseMoney('12,50')).toBe(1250);
  expect(parseMoney('R12.50')).toBe(1250);
  expect(parseMoney('R 12')).toBe(1200);
  expect(parseMoney('.5')).toBe(50);
  expect(parseMoney('')).toBeNull();
  expect(parseMoney('12.555')).toBe('invalid');
  expect(parseMoney('-3')).toBe('invalid');
});

const form = (o: Partial<typeof emptyPurchaseForm>) => ({ ...emptyPurchaseForm, ...o });

test('per-unit price builds the total in cents', () => {
  const r = validatePurchase(form({ quantity: '3', priceMode: 'unit', price: '3,33' }), false);
  expect(r.ok && r.values.total_price_cents).toBe(999);
});

test('weight items always take the total and an optional whole pack count', () => {
  const r = validatePurchase(form({ quantity: '1,250', priceMode: 'unit', price: '150', packs: '3' }), true);
  expect(r).toEqual({ ok: true, values: {
    quantity: 1.25, total_price_cents: 15000, is_special: 0, regular_price_cents: null, special_note: null, is_emergency: 0, pack_count: 3,
  } });
  expect(validatePurchase(form({ quantity: '1', price: '10', packs: '1.5' }), true)).toEqual({
    ok: false, errors: { packs: 'Packs must be a whole number' },
  });
});

test('purchase needs quantity and price; normal price and note only count when Special is on', () => {
  expect(validatePurchase(form({}), false)).toEqual({
    ok: false, errors: { quantity: 'Enter how many you bought', price: 'Enter the price paid' },
  });
  const plain = validatePurchase(form({ quantity: '1', price: '10', normalPrice: '12', note: 'x' }), false);
  expect(plain.ok && [plain.values.regular_price_cents, plain.values.special_note]).toEqual([null, null]);
  const special = validatePurchase(form({ quantity: '1', price: '10', special: true, normalPrice: '12', note: ' 3 for 2 ' }), false);
  expect(special.ok && [special.values.is_special, special.values.regular_price_cents, special.values.special_note]).toEqual([1, 1200, '3 for 2']);
});

test('purchaseToForm round-trips', () => {
  const v = { quantity: 2, total_price_cents: 2599, is_special: 1 as const, regular_price_cents: 1500, special_note: 'deal', is_emergency: 1 as const, pack_count: null };
  const r = validatePurchase(purchaseToForm(v), false);
  expect(r).toEqual({ ok: true, values: v });
});

const p = (date: string, total: number, is_special = 0) => ({ date, quantity: 1, total_price_cents: total, is_special });

test('normalPrice ignores specials', () => {
  expect(normalPrice([p('2026-01-01', 1200), p('2026-02-01', 1300), p('2026-03-01', 1400), p('2026-04-01', 1000, 1)])).toBe(1300);
});

test('normalPrice uses the last 3, or the most recent with fewer', () => {
  expect(normalPrice([p('2026-01-01', 9900), p('2026-02-01', 1200), p('2026-03-01', 3000), p('2026-04-01', 1300)])).toBe(1300);
  expect(normalPrice([p('2026-01-01', 1200), p('2026-02-01', 1500)])).toBe(1500);
  expect(normalPrice([p('2026-01-01', 1000, 1)])).toBeNull();
});

test('stockDelta ignores purchases before the last stock-take', () => {
  const take = '2026-10-26T08:00:00.000Z';
  expect(stockDelta(null, { date: '2026-10-26T10:00:00.000Z', quantity: 2 }, take)).toBe(2);
  expect(stockDelta(null, { date: '2026-10-25T10:00:00.000Z', quantity: 2 }, take)).toBe(0);
  expect(stockDelta(null, { date: '2026-10-25T10:00:00.000Z', quantity: 2 }, null)).toBe(2);
  expect(stockDelta({ date: '2026-10-26T10:00:00.000Z', quantity: 5 }, null, take)).toBe(-5);
  expect(stockDelta({ date: '2026-10-26T10:00:00.000Z', quantity: 5 }, { date: '2026-10-26T10:00:00.000Z', quantity: 3 }, take)).toBe(-2);
});

test('applyStockDelta never goes below zero', () => {
  expect(applyStockDelta(2, -5)).toBe(0);
  expect(applyStockDelta(0.1, 0.2)).toBe(0.3);
});

test('shiftDay keeps the time and never goes into the future', () => {
  const now = new Date('2026-10-26T10:30:00.000Z');
  expect(shiftDay(now.toISOString(), -1, now)).toBe('2026-10-25T10:30:00.000Z');
  expect(shiftDay('2026-10-25T10:30:00.000Z', 1, now)).toBe('2026-10-26T10:30:00.000Z');
  expect(shiftDay(now.toISOString(), 1, now)).toBe(now.toISOString());
});

test('dayLabel and dayRange', () => {
  const now = new Date('2026-10-26T10:30:00.000Z');
  expect(dayLabel(now.toISOString(), now)).toBe('Today');
  expect(dayLabel(shiftDay(now.toISOString(), -1, now), now)).toBe('Yesterday');
  const [start, end] = dayRange(now.toISOString());
  expect(start <= now.toISOString() && now.toISOString() < end).toBe(true);
  expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 3600 * 1000);
});
```

- [ ] **Step 2:** Run `npx jest purchaseRules`. Expected: FAIL, cannot find module.
- [ ] **Step 3:** Implement `purchaseRules.ts`.
  - Validation copy is exactly as in the tests. Add: `Price must be more than 0`, `Normal price must be blank or more than 0`, and `Quantity must be more than 0`.
  - Quantity uses `parseDecimal` + `roundQty`.
  - The per-unit total is `Math.round(unitCents * quantity)`.
  - A weight item ignores `priceMode` and treats the price as the total.
  - `packs` only counts for weight items, and blank means `null`.
- [ ] **Step 4:** Run `npx jest` and `npx tsc --noEmit`. Expected: all pass, no errors.
- [ ] **Step 5: Commit**: `git commit -m "feat: purchase rules for money, validation, normal price and stock effect"`

### Task 2: Stores and purchase repository

**Files:**
- Create: `eekhoring/src/stores/storeRepo.ts`, `eekhoring/src/purchases/purchaseRepo.ts`

**Interfaces:**
- Consumes: `PurchaseValues`, `stockDelta`, `applyStockDelta` (Task 1); `findDuplicate` (items, generic over `{ id, name }`).
- Produces:
  - `STORES_SQL = 'SELECT id, name, is_city FROM stores ORDER BY name COLLATE NOCASE'`
  - `addStore(name: string, isCity: boolean): Promise<string>`: returns the new id. The screen checks for duplicates with `findDuplicate` before calling it.
  - `addPurchase(p: PurchaseValues & { item_id: string; store_id: string; date: string }): Promise<string>`
  - `updatePurchase(id: string, p: PurchaseValues & { store_id: string; date: string }): Promise<void>`. The item can't change.
  - `deletePurchase(id: string): Promise<void>`
  - Each runs in one `db.writeTransaction`:
    1. Read the old purchase row (update and delete only).
    2. Read the item's latest stock-take date (`SELECT MAX(date) AS d FROM stock_counts WHERE item_id = ? AND source = 'stocktake'`).
    3. Compute `stockDelta`.
    4. Write or delete the purchase.
    5. If `delta !== 0`, read the current level (latest row, `ORDER BY date DESC LIMIT 1`, with 0 when there's none) and insert a `stock_counts` row: `applyStockDelta(level, delta)`, `date = new Date().toISOString()`, source `'purchase'` for add or `'adjustment'` for update and delete, `entered_packs = null`.

- [ ] **Step 1:** Implement both files following `stockRepo.ts` style. They have no unit tests (the house rule: repos are untested). Their maths is Task 1's tested functions, and Task 7's phone checks cover the SQL.
- [ ] **Step 2:** Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit**: `git commit -m "feat: store and purchase repositories with stock effect"`

### Task 3: Purchase form and day stepper components

**Files:**
- Create: `eekhoring/src/components/DayStepper.tsx`, `eekhoring/src/components/Field.tsx`, `eekhoring/src/purchases/PurchaseForm.tsx`

**Interfaces:**
- Consumes: the theme, `Chip`, `PrimaryButton`, and Task 1 rules.
- Produces:
  - `DayStepper({ value, onChange, now }: { value: string; onChange: (iso: string) => void; now: Date })`: `◀  {dayLabel}  ▶` in a `surfaceRaised` pill with 48×48 arrows. The right arrow is disabled on today. Uses `shiftDay`.
  - `Field({ label, value, onChangeText, error, hint, decimal, placeholder })`: the item form's themed label, input, hint and error block, extracted for reuse. Error text sits on `bg`.
  - `SwitchRow({ label, value, onValueChange })`: a themed label plus `Switch` row, 48 tall.
  - `PurchaseForm({ form, onChange, errors, soldByWeight, unit, symbol })`: renders the fields in this order:
    1. Quantity (`kg` label for weight items).
    2. For non-weight items, `Chip`s "Total" / "Per {unit}" choosing `priceMode`.
    3. Price.
    4. A live line in caption style: `{formatMoney(unit price)} per {kg|unit}`, shown when quantity and price both parse.
    5. Packs (optional, weight items only).
    6. `SwitchRow` "Special price". When it's on: "Normal price per {kg|unit} (optional)" and "Note (optional)".
    7. `SwitchRow` "Emergency (ran out, bought locally)".

    It has no buttons, so callers add them.

- [ ] **Step 1:** Write the three files.
- [ ] **Step 2:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean, all pass.
- [ ] **Step 3: Commit**: `git commit -m "feat: purchase form, day stepper and field components"`

### Task 4: Log purchases screen

**Files:**
- Create: `eekhoring/src/app/purchases.tsx`
- Modify: `eekhoring/src/app/index.tsx` (a full-width **accent** button "Log purchases" linking to `/purchases`, above the Stock-take and + Add item row. It's the screen's one accent element: `accent` fill, `onPrimary`-dark text. Add an `accent` variant to `PrimaryButton`, with text colour `palettes.dark.bg`, which has ≥ 4.5:1 contrast on both accents. Add that pair to the Task 1 theme contrast test.)

**Interfaces:**
- Consumes: `STORES_SQL`, `addStore`, `addPurchase` (Task 2); `PurchaseForm`, `DayStepper` (Task 3); `CategoryChips`/`Chip`, `ItemCard`, `PrimaryButton`, `Screen`; `validatePurchase`, `dayRange`, `formatMoney`, `unitPriceCents` (Task 1); `findDuplicate`.

- [ ] **Step 1: Shop section.**
  - Store chips come from `STORES_SQL` (`Chip`s, horizontal), plus a "+ New shop" chip. That opens an inline name input, a `SwitchRow` "City shop (where the monthly trip goes)", and Add. Add refuses a duplicate name with `You already have {name}`. On success it selects the new store.
  - The default store is the one from the most recent purchase (`SELECT store_id FROM purchases ORDER BY date DESC LIMIT 1`).
  - Below the chips sits `DayStepper` (default now).
- [ ] **Step 2: Add-item section.**
  - Before an item is chosen: a search `TextInput`, and up to 5 matching active items (name `LIKE`) as tappable rows.
  - After one is chosen: its `ItemCard` with a "Change" chip as `right`, then `PurchaseForm`, then a filled "Add to list" button.
  - Add validates first (store chosen, else `Pick a shop first`). Then it runs `addPurchase` under `createGuard` with `date` = the stepper value, and resets the item and form while keeping the shop and day.
- [ ] **Step 3: The list.**
  - Query the purchases at the selected store within `dayRange(day)`, joined with item name and unit, newest first.
  - Each is an `ItemCard`: meta `{quantity} {unit} · {formatMoney(unit price)} per {unit}` plus ` · SPECIAL` / ` · EMERGENCY`, and `right` = the total in 16 semi-bold tabular digits.
  - Tapping a card opens `/purchase/{id}`.
  - A footer line reads `{n} items · {formatMoney(sum)}`.
- [ ] **Step 4:** If the add form holds unsaved input, `usePreventRemove` asks "Discard this item?", the same as in Stock-take.
- [ ] **Step 5:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean. (If typed routes reject `/purchases`, regenerate them by running `npx expo start` briefly on a free port.)
- [ ] **Step 6: Commit**: `git commit -m "feat: log purchases as a shop list"`

### Task 5: Edit and delete a purchase

**Files:**
- Create: `eekhoring/src/app/purchase/[id].tsx`

- [ ] **Step 1:** Load the purchase, joined with the item's name, unit and `sold_by_weight`, plus the stores. Show "Loading…", the query error, or "Purchase not found" the same way the item screen does.
- [ ] **Step 2:** At the top, show the item name (not editable). Below it come the store chips, a `DayStepper`, and `PurchaseForm` seeded with `purchaseToForm`. "Save" runs `updatePurchase` then `router.back()`. "Delete" asks `Delete this purchase? Stock is corrected.` with Cancel / Delete, then `deletePurchase` and `router.back()`. Both go through `createGuard`.
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean.
- [ ] **Step 4: Commit**: `git commit -m "feat: edit and delete purchases with stock correction"`

### Task 6: Price history

**Files:**
- Create: `eekhoring/src/app/prices/[id].tsx`
- Modify: `eekhoring/src/app/item/[id].tsx` (a "Prices" outline button under "Stock & history")

- [ ] **Step 1:** Load the item and its purchases joined with the store name, ordered by date. Group them by store, with stores ordered by their most recent purchase.
- [ ] **Step 2:** Each store is a card:
  - Header: the store name, plus a "City" caption if `is_city`.
  - A big line: `Normal {formatMoney(normalPrice)} per {kg|unit}`, or `No normal price yet`.
  - The rows, newest first: date, quantity, unit price, total.
  - Specials get a "SPECIAL" pill in `accent` and the caption `normal {formatMoney(regular_price_cents ?? store normal)}`, or `normal price unknown`.
  - Emergencies get an "EMERGENCY" caption in `danger` (light `warning` is only 3.7:1 on cards).
  - Tapping a row opens `/purchase/{id}`.
- [ ] **Step 3:** Empty state: `No purchases yet. Log one from the Stock screen.`
- [ ] **Step 4:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean.
- [ ] **Step 5: Commit**: `git commit -m "feat: price history per shop with specials badged"`

### Task 7: Verify, review, phone check

- [ ] **Step 1:** Run `npm test`, `npx tsc --noEmit`, `npx expo lint` and `npx expo-doctor`. Expected: all pass and clean.
- [ ] **Step 2:** One fresh reviewer (most capable model) reviews `main..phase-3` against this plan, the specs and the Review Focus. Fix what it confirms, then rerun Step 1.
- [ ] **Step 3:** Owner phone checks. The phone is on the live-reload dev server, and no rebuild is needed.
  1. Stock → **Log purchases**. Add a shop "Makro" as a city shop. It's selected, and the day shows Today.
  2. Add Rice: 2 at R25,99 total. It appears in the list, and the footer total updates. Add Milk "per unit" 3 × R18,50. The total shows R55.50.
  3. Add a kg item: type 1,25 kg for R150. The live line shows R120.00 per kg. Enter 3 packs. Then in Stock-take, the item's **packs** button now works.
  4. Stock screen: Rice went up by 2.
  5. Tap Rice in the list and change it to 3. Stock goes up by 1 more. Delete it: stock drops by 3, and never below 0.
  6. Log a special: tap Special, enter a normal price of R30, and save. Item → **Prices** shows a SPECIAL pill and "normal R30.00". The normal price line ignores the special.
  7. Step the day back to Yesterday and log something for an item counted in today's stock-take. Its stock doesn't change.
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch.
