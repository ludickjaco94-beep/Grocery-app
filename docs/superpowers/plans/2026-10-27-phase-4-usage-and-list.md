# Phase 4: Usage Engine & Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After two stock-takes, the app works out how much of each item gets used per month and suggests what to buy. The owner taps **Make list**, ticks items off in the shop, and taps **Complete trip** to turn the ticked items into purchases. A tab bar switches between Stock and List.

**Architecture:**
- Pure rules live in two files, and both are unit-tested:
  - `src/usage/usageRules.ts`: monthly usage, suggested quantity, running low, and the explanation line.
  - `src/list/listRules.ts`: Make list / Refresh, estimated total, and trip validation.
- One hook, `src/usage/useUsage.ts`, loads stock-takes, purchases, items and current stock, then returns a usage summary per item. The Stock screen, the List screen and the item screen all use it.
- `src/list/listRepo.ts` writes `list_entries`. `completeTrip` writes every purchase and clears its entries in one `writeTransaction`. It reuses a new `insertPurchase(tx, p)` taken out of `purchaseRepo.ts`.
- Routes:
  - `app/(tabs)/_layout.tsx`: expo-router's JS `Tabs`, with Stock as the first tab.
  - `app/(tabs)/index.tsx`: the current Stock screen, moved here.
  - `app/(tabs)/list.tsx`: the shopping list.
  - `app/trip/complete.tsx`: the Complete trip screen.

**Tech Stack:** The phase 3 stack. No new dependencies. `Tabs` is exported by `expo-router` (JS tabs, so no native rebuild is needed).

**Spec:** [grocery-app-handover.md](../../../grocery-app-handover.md) sections 3, 5.1–5.3, 5.4 (estimated total line only) and 6 (screens 1 and 4); [docs/superpowers/specs/2026-10-26-grocery-planner-design.md](../specs/2026-10-26-grocery-planner-design.md) 4.1, 4.2 and 4.3; [DESIGN_SPEC.md](../../../DESIGN_SPEC.md) 2 (`warning` = running low), 5.8 and 7. Owner decisions (2026-10-27):
- **Complete trip logs purchases now.** Pick the shop once, and each price is prefilled with the last price. Fuel and toll wait for phase 5.
- The list is **made on demand**, and stays put while shopping. "Refresh" redoes the suggestions.
- **Stock is the home tab.**

## Global Constraints

- **Usage (5.1):** reads only `source = 'stocktake'` rows plus the purchases between them. For each interval between consecutive stock-takes of one item: `used = start + bought − end`, where `bought` sums purchases with `start.date < date ≤ end.date`. Average monthly usage = `Σ used / Σ days × 30`, over the intervals that end within the last `settings.usage_window_months` months (default 3). If none end in the window, use the most recent interval.
- **Two stock-takes on the same day: the later one wins** (spec 5). Fewer than 2 stock-takes (after that rule) means usage falls back to `est_monthly_usage`. If that's blank too, the item is **needs data**, and nothing is suggested.
- **Suggestion (5.2), monthly items only:** `target = avg × (1 + buffer_pct/100)`, `cap = avg × max_months_cover`, `to_buy = clamp(target − stock, 0, max(0, cap − stock))`. Stock that has never been counted counts as 0.
- **Rounding up:**
  - Weight items: up to 0.1 kg. Pack size never applies to them (spec 4.2).
  - Non-weight items with `pack_size`: up to a multiple of `pack_size`.
  - Else unit `kg` or `L`: up to 0.1.
  - Else (`each`, `pack`): up to a whole number.
- **As-needed items (5.3)** are never auto-sized. They're added by hand with quantity 1.
- **`list_entries` (spec 4.3):** `id, item_id, quantity, added_manually, ticked, ticked_at, ticked_by` (`ticked_by` stays null). Ticks are written to the table at once. At most one entry per item.
- **Estimated total:** `Σ quantity × last city unit price`. That price is the most recent **non-special** purchase at an `is_city` store. If there is none, use the most recent non-special purchase at any store. If there is none at all, the item is unpriced: it's left out of the total and counted in an `n without a price` caption.
- **Running low:** a counted item with known usage whose stock is ≤ 25% of its monthly usage (about a week left). The stock number turns `warning`, which is allowed at 20 bold because it's large text (3:1). Stock of exactly 0 turns `danger`.
- Money is integer cents, quantities go through `roundQty`, the symbol comes from `settings.currency_symbol` (default `R`), and all colours come from `src/theme` (the guard test enforces this). There's one accent element per screen: the Stock screen keeps **Log purchases**, and the List screen has none. `Link asChild` children take a single style object. Owner commands use `npx.cmd`.

## Review Focus

1. **A purchase the owner forgot to log** makes an interval's `used` negative (end stock is higher than start + bought). That interval is skipped, never counted as negative or as zero usage. → Task 1 test `monthlyUsage skips an interval with negative usage`.
2. **An item counted only once, with no estimate**, is "needs data", and the app suggests nothing. → Task 1 tests `monthlyUsage needs two stock-takes` and `usageFor falls back to the estimate, then needs data`.
3. **Stock already above the cap** gives buy 0, never a negative. → Task 1 test `suggestBuy never goes below zero above the cap`.
4. **Refresh after ticking in the shop:** ticked and hand-added entries survive untouched, and a ticked item is never added a second time. → Task 2 test `planList keeps ticked and manual entries`.
5. **Complete trip with one bad price:** nothing is saved, and the bad row shows its error. → Task 2 test `validateTrip rejects the whole trip on one bad row`. In the repo, all writes share one transaction.

---

### Task 1: Usage rules

**Files:**
- Create: `src/usage/usageRules.ts`
- Test: `src/usage/usageRules.test.ts`

(All paths in this plan are relative to `eekhoring/`.)

**Interfaces:**
- Consumes: `roundQty` (stock), `Unit` (items).
- Produces:
  - `type Dated = { date: string; quantity: number }`
  - `monthlyUsage(takes: Dated[], purchases: Dated[], now: Date, windowMonths: number): number | null`. The inputs are one item's rows in any order, and the result is not rounded. Uses `usageWindowStart` from `stockRules` for the window edge.
  - `type Usage = { perMonth: number; source: 'measured' | 'estimate' } | { perMonth: null; source: 'none' }`
  - `usageFor(measured: number | null, estimate: number | null): Usage`
  - `suggestBuy(i: { perMonth: number; buffer_pct: number; max_months_cover: number; stock: number | null; pack_size: number | null; sold_by_weight: number; unit: Unit }): number`
  - `isRunningLow(stock: number | null, perMonth: number | null): boolean`
  - `explainSuggestion(u: Usage, i: { buffer_pct: number; unit: string; stock: number | null }, toBuy: number | null): string`

- [ ] **Step 1: Write the failing tests** (dates are ISO strings 30 days apart unless stated):
  - `monthlyUsage needs two stock-takes`: one take → `null`. Two takes on the same day → `null`.
  - `monthlyUsage uses start + bought − end`: takes 10 (day 0) and 4 (day 30), a purchase of 6 on day 10 → `12`.
  - `monthlyUsage normalises to 30 days`: 10 → 4 over 15 days → `12`.
  - `monthlyUsage counts a purchase dated exactly at the end stock-take as bought before it`.
  - `monthlyUsage ignores a purchase dated exactly at the start stock-take`, because the start count already includes it.
  - `same-day stock-takes: the later wins`: 10 at 09:00 and 8 at 18:00 on day 0, then 2 at 18:00 on day 30 → `6`.
  - `monthlyUsage skips an interval with negative usage`: 10 → 4 (day 30), then 4 → 9 (day 60, nothing bought) → `6`. With only the bad interval → `null`.
  - `monthlyUsage averages the window by days`: intervals of 30 days using 6 and 60 days using 6, both within 3 months → `(12 / 90) × 30 = 4`.
  - `monthlyUsage falls back to the latest interval when none end in the window`.
  - `usageFor falls back to the estimate, then needs data`: `(3, 5)` → measured 3, `(null, 5)` → estimate 5, `(null, null)` → none.
  - `suggestBuy` (buffer 10, cap 2):
    - perMonth 4, stock 1 → `4` (3.4 rounded up, unit `each`).
    - `suggestBuy never goes below zero above the cap`: stock 9 → `0`.
    - It caps at `cap − stock`: buffer 100, cap 1.5, perMonth 4, stock 0 → `6`.
    - Weight item, perMonth 3.33, stock 0 → `3.7` (3.663 → 3.7). Pack size is ignored.
    - `pack_size` 6, need 7 → `12`.
    - Float noise: need `4.000000001` with `each` → `4`, not 5.
    - Never-counted stock is 0.
  - `isRunningLow`: `(1, 4)` → true, `(2, 4)` → false, `(0, 4)` → true, `(null, 4)` → false, `(1, null)` → false.
  - `explainSuggestion`:
    - Exactly `Used about 4.2/month, buffer 10%, you have 1 left, buy 4`.
    - With an estimate source: `Estimated 4/month, …`.
    - With none: `Needs data: do two stock-takes or set a monthly estimate`.
    - Numbers show to 1 decimal place, with a trailing `.0` dropped.
- [ ] **Step 2:** Run `npx jest src/usage`. Expected: it fails because the module is not found.
- [ ] **Step 3:** Implement `usageRules.ts`.
  - Round up with `Math.ceil(x / step - 1e-9) * step`, then `roundQty`.
  - Same-day dedupe compares `new Date(d).toDateString()`.
- [ ] **Step 4:** Run `npx jest` and `npx tsc --noEmit`. Expected: all pass, clean.
- [ ] **Step 5: Commit**: `git commit -m "feat: usage engine rules (monthly usage, suggested buy, running low)"`

### Task 2: List rules

**Files:**
- Create: `src/list/listRules.ts`
- Test: `src/list/listRules.test.ts`

**Interfaces:**
- Consumes: `validatePurchase`, `emptyPurchaseForm`, `PurchaseValues`, `PurchaseFormState` (purchases).
- Produces:
  - `type Entry = { id: string; item_id: string; quantity: number; added_manually: number; ticked: number }`
  - `planList(suggestions: { item_id: string; quantity: number }[], entries: Entry[]): { insert: { item_id: string; quantity: number }[]; update: { id: string; quantity: number }[]; remove: string[] }`. Suggestions contain only items with quantity > 0.
    - A ticked or manual entry is never touched.
    - An unticked suggested entry is updated to its new quantity, or removed if it has no suggestion now.
    - A suggestion with no entry is inserted.
  - `estimateTotal(rows: { quantity: number; unitCents: number | null }[]): { cents: number; unpriced: number }`. Rounds once, at the end.
  - `type TripRow = { entryId: string; quantity: string; price: string; soldByWeight: boolean }`
  - `validateTrip(rows: TripRow[]): { ok: true; values: (PurchaseValues & { entryId: string })[] } | { ok: false; errors: Record<string, string> }`. Each row goes through `validatePurchase({ ...emptyPurchaseForm, quantity, price }, soldByWeight)`. The first error message of a row is keyed by `entryId`.
  - `prefillPrice(unitCents: number | null, quantity: number): string`: `''` when unknown, else `(Math.round(unitCents × quantity) / 100).toFixed(2)`.

- [ ] **Step 1: Write the failing tests:**
  - `planList on an empty list inserts every suggestion`.
  - `planList keeps ticked and manual entries`: a ticked entry for rice and a manual entry for soap are left out of update and remove, even when rice is suggested again (no second rice insert).
  - `planList updates and removes unticked suggested entries`.
  - `estimateTotal skips and counts unpriced rows`: `[{2, 1250}, {1, null}, {3, 333.33}]` → `{ cents: 3500, unpriced: 1 }`.
  - `validateTrip rejects the whole trip on one bad row`: two good rows and one with price `abc` → `ok: false` with exactly that row's error.
  - `validateTrip passes the values through` for good rows, with weight items priced by the total.
  - `prefillPrice`: `(1250, 2)` → `'25.00'`, `(null, 2)` → `''`.
- [ ] **Step 2:** Run `npx jest src/list`. Expected: it fails because the module is not found.
- [ ] **Step 3:** Implement `listRules.ts`.
- [ ] **Step 4:** Run `npx jest` and `npx tsc --noEmit`. Expected: all pass, clean.
- [ ] **Step 5: Commit**: `git commit -m "feat: shopping list rules (make/refresh, estimated total, trip validation)"`

### Task 3: Usage hook and list repository

**Files:**
- Create: `src/usage/useUsage.ts`, `src/list/listRepo.ts`
- Modify: `src/purchases/purchaseRepo.ts`. Extract `insertPurchase(tx, p)` from `addPurchase`, which then calls it. Behaviour stays the same.

**Interfaces:**
- Consumes: Task 1 and 2 rules; `CURRENT_STOCK_SQL`; `moveStock` (stays private inside `purchaseRepo`, called by `insertPurchase`).
- Produces:
  - `export async function insertPurchase(tx: Transaction, p: PurchaseValues & { item_id: string; store_id: string; date: string }): Promise<string>`, which inserts the row and moves stock.
  - `type ItemUsage = { usage: Usage; stock: number | null; toBuy: number | null; low: boolean; explain: string }`. `toBuy` is `null` for as-needed items and for items with no usage.
  - `useUsage(): { byItem: Map<string, ItemUsage>; isLoading: boolean }`.
    - It runs `useQuery` for: active items, all `stocktake` rows, all purchases (`item_id, date, quantity`), `CURRENT_STOCK_SQL`, and the settings window.
    - It groups the rows in JS. The comment reads: `shortcut: loads all stock-take and purchase rows, fine for ~150 items and a few years; filter by date in SQL if the Stock screen gets slow`.
  - `LAST_PRICE_SQL`: one row per item, `item_id, unit_cents`, following the Global Constraints price rule (city non-special, then any non-special). It's used by the List and Complete trip screens.
  - `makeList(suggestions: { item_id: string; quantity: number }[]): Promise<void>`: reads the entries, then applies `planList` in one transaction.
  - `addToList(itemId: string, quantity: number, ticked: boolean): Promise<void>`: sets `added_manually = 1`. It does nothing if the item already has an entry.
  - `setEntryQuantity(id: string, quantity: number): Promise<void>`, `setTicked(id: string, ticked: boolean): Promise<void>` (sets `ticked_at` to now, or null), and `removeEntry(id: string): Promise<void>`.
  - `completeTrip(storeId: string, date: string, rows: (PurchaseValues & { entryId: string; item_id: string })[]): Promise<void>`: one `writeTransaction`, with `insertPurchase` then `DELETE FROM list_entries WHERE id = ?` per row.

- [ ] **Step 1:** Extract `insertPurchase`. Run `npx jest` and `npx tsc --noEmit`. Expected: all pass, with no behaviour change.
- [ ] **Step 2:** Write `useUsage.ts` and `listRepo.ts`.
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean.
- [ ] **Step 4: Commit**: `git commit -m "feat: usage hook and shopping list repository"`

### Task 4: Tab bar and running-low colour

**Files:**
- Move: `src/app/index.tsx` → `src/app/(tabs)/index.tsx` (with `git mv`).
- Create: `src/app/(tabs)/_layout.tsx`.
- Modify: `src/app/_layout.tsx` (`<Stack.Screen name="(tabs)" options={{ headerShown: false }} />`), `src/components/ItemCard.tsx` (`StockNumber` gains `tone?: 'normal' | 'low' | 'out'`).

- [ ] **Step 1:** `(tabs)/_layout.tsx` uses `Tabs` from `expo-router`, themed with `t.bg` header and bar, `t.border` top border, `t.primary` active tint and `t.textSecondary` inactive tint. The tabs, in order:
  - `index`: title "Stock", icon `fridge-outline`.
  - `list`: title "List", icon `format-list-checks`.

  The icons are MaterialCommunityIcons. Remove the `Stack.Screen options={{ title: 'Stock' }}` from the moved screen, since the tab sets it.
- [ ] **Step 2:** In the Stock screen, read `useUsage()`. Pass `tone` = `'out'` when stock is 0, `'low'` when `isRunningLow`, else `'normal'`. `StockNumber` colours the number `danger` for out and `warning` for low, and the caption stays `textSecondary`.
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. If typed routes break, regenerate them (see the handoff gotcha). Expected: clean.
- [ ] **Step 4: Commit**: `git commit -m "feat: Stock and List tabs; running-low stock colour"`

### Task 5: Shopping list screen

**Files:**
- Create: `src/app/(tabs)/list.tsx`

**Interfaces:**
- Consumes: `useUsage`, `LAST_PRICE_SQL`, the list repo (Task 3); `planList`, `estimateTotal` (Task 2); `ItemCard`, `QuantityStepper`, `Chip`, `PrimaryButton`, `Screen`, `groupByCategory`; `stepFor`, `roundQty`.

- [ ] **Step 1: Header and empty state.**
  - Caption: `{n} items · about {formatMoney(cents)}`, plus ` · {k} without a price` when `unpriced > 0`.
  - The "Make list" / "Refresh" outline button:
    - The label is "Make list" when there are no entries.
    - The suggestions are every active monthly item with `toBuy > 0`.
    - Refresh first asks `Refresh suggestions? Ticked and hand-added items stay.` with Cancel / Refresh.
  - Empty state: `No list yet. Tap Make list after a stock-take.`
  - When monthly items need data, a caption: `{m} monthly items need data`.
- [ ] **Step 2: Entries**, grouped by category. Each is an `ItemCard`:
  - meta = `about {formatMoney(qty × unit price)}` or `no price yet`, plus ` · added` if manual.
  - `right` = a `QuantityStepper` (step `stepFor(unit)`).
  - Tapping the card toggles the tick. A ticked card is `muted`, and its name gets a leading `✓ `. Set `accessibilityRole="checkbox"` with a `checked` state.
  - Stepping below one step asks `Remove {name} from the list?`, then calls `removeEntry`. A typed quantity is saved on blur when it parses as > 0.
- [ ] **Step 3: As needed section.**
  - It lists active as-needed items with no entry, each as an `ItemCard` with an "Add" `Chip` that calls `addToList(id, 1, false)`.
  - Below it, a "+ New item" outline button opens `/item/new?list=1` (Task 6).
- [ ] **Step 4: Footer.** A filled "Complete trip ({ticked})" button, disabled when nothing is ticked, opens `/trip/complete`. All writes go through `createGuard`.
- [ ] **Step 5:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean.
- [ ] **Step 6: Commit**: `git commit -m "feat: shopping list with make/refresh, ticks, as-needed items and estimated total"`

### Task 6: New item from the list; explanation on the item screen

**Files:**
- Modify: `src/app/item/[id].tsx`

- [ ] **Step 1:** Read the `list` search param. On saving a new item with `list=1`, `createItem` then `addToList(newId, 1, true)` (a ticked, hand-added entry, spec 4.3), then `router.back()`.
- [ ] **Step 2:** For an existing item, show `useUsage().byItem.get(id)?.explain` as a caption above the "Stock & history" button.
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean.
- [ ] **Step 4: Commit**: `git commit -m "feat: add a new item straight from the list; explain the suggestion on the item screen"`

### Task 7: Complete trip

**Files:**
- Create: `src/components/StorePicker.tsx`, `src/app/trip/complete.tsx`
- Modify: `src/app/purchases.tsx`. Its store chips and "+ New shop" input move into `StorePicker` with no behaviour change, including the duplicate check and default-to-last-store.

**Interfaces:**
- Produces: `StorePicker({ value, onChange, error }: { value: string | null; onChange: (id: string) => void; error?: string | null })`. It owns the store query, the new-shop input and the `addStore` call. The caller owns the default-store logic.
- Consumes: `StorePicker`, `DayStepper`, `Field`, `PrimaryButton`; `LAST_PRICE_SQL`, `completeTrip` (Task 3); `validateTrip`, `prefillPrice` (Task 2); `purchaseDate`.

- [ ] **Step 1:** Extract `StorePicker`, and switch `purchases.tsx` to it. Run `npx tsc --noEmit`.
- [ ] **Step 2: Screen.**
  - Top: `StorePicker` (defaulting to the last purchase's store) and a `DayStepper`.
  - Then one card per ticked entry: the name, a quantity `Field` (prefilled with the entry quantity, `kg` label for weight items) and a "Total paid" `Field`.
  - The total is prefilled with `prefillPrice(last price at the chosen store, else LAST_PRICE_SQL, qty)`. It's recomputed when the quantity changes, unless the owner has typed in the price.
- [ ] **Step 3: Save.** The button reads "Save {n} purchases".
  - Without a store, show `Pick a shop first`.
  - Run `validateTrip`. On errors, show each one under its card and save nothing.
  - Otherwise, `completeTrip(storeId, purchaseDate(day, now), …)` under `createGuard`, then `router.back()`.
  - Unticked entries stay on the list. If the owner tries to leave with edits, `usePreventRemove` asks `Discard this trip?`.
- [ ] **Step 4:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean.
- [ ] **Step 5: Commit**: `git commit -m "feat: complete trip turns ticked items into purchases"`

### Task 8: Items sold by volume (L) work like kg

Owner request (2026-10-27): bottles come in different sizes, and a bigger or smaller one, or a special, can be cheaper. So L items need a price per L across sizes, just like kg.

**Files:**
- Modify:
  - `src/items/itemRules.ts` and its test.
  - `src/app/item/[id].tsx`.
  - `src/purchases/PurchaseForm.tsx`.
  - `src/app/prices/[id].tsx`.
  - `src/app/stocktake.tsx`.
  - `src/app/(tabs)/index.tsx`.
  - `src/app/purchases.tsx`.

**Decision:**
- The column `items.sold_by_weight` keeps its name, but now means **"sold by measure"**, with `unit` either `kg` or `L`. There's no schema change, and existing items stay kg.
- Everything spec 4.2 says about kg applies to L too:
  - Quantity is entered as a decimal.
  - The total paid is entered, with the price per unit shown live.
  - There's an optional pack (bottle) count, and a packs mode in stock-take.
  - Suggestions round up to 0.1, and pack size never applies.
- The phase 5 "total kg for Meat" stays kg only.

- [ ] **Step 1: Write the failing tests** in `itemRules.test.ts`:
  - `sold by measure keeps L`: `soldByWeight: true, unit: 'L'` → values `unit: 'L', sold_by_weight: 1, pack_size: null`.
  - `sold by measure turns each into kg`: `soldByWeight: true, unit: 'each'` → `unit: 'kg'`.
- [ ] **Step 2:** Run `npx jest src/items`. Expected: the first test fails, because the unit is forced to `kg`.
- [ ] **Step 3:** In `validateItem`, set `unit: f.soldByWeight ? (f.unit === 'L' ? 'L' : 'kg') : f.unit`.
- [ ] **Step 4: Screens.**
  - Item form: the switch reads "Sold by weight or volume". When it's on, show `Chip`s "kg" / "L" instead of the unit row, with the hint `Unit: {unit}. Prices show per {unit}.` The monthly estimate label already uses the unit.
  - Replace every hard-coded `'kg'` for a sold-by-measure item with `item.unit`:
    - `PurchaseForm`'s `per` and its quantity label (`Weight (kg)` / `Volume (L)`).
    - The `per` on the Prices screen.
    - The stock-take mode chip label, and the comment on line 66.
  - The `'by weight'` metas become `by weight` / `by volume`, depending on the unit.
- [ ] **Step 5:** Run `npx jest`, `npx tsc --noEmit` and `npx expo lint`. Expected: all pass, clean.
- [ ] **Step 6: Commit**: `git commit -m "feat: items sold by volume (L) priced and counted like kg"`

### Task 9: Verify, review, phone check

- [ ] **Step 1:** Run `npm test`, `npx tsc --noEmit`, `npx expo lint` and `npx expo-doctor`. Expected: all pass and clean.
- [ ] **Step 2:** One fresh reviewer (most capable model) reviews `main..phase-4` against this plan, the specs and the Review Focus. Fix what it confirms, then rerun Step 1.
- [ ] **Step 3:** Owner phone checks. The phone is on the live-reload dev server, and no rebuild is needed.
  1. The app opens on **Stock**, with a tab bar showing Stock and List. Both tabs work.
  2. Pick a monthly item with one stock-take. Its item screen says "Needs data…". Set a monthly estimate of 4. The screen now reads "Estimated 4/month…".
  3. Do a stock-take with that item at 1. The Stock number turns yellow/orange (running low). Set it to 0 and it turns red.
  4. **List → Make list.** The item appears with a suggested quantity, and the header shows "about R…".
  5. Tick it, then tap **Refresh**. It stays ticked and isn't added twice. Add an as-needed item with **Add**.
  6. **+ New item** from the list. Save it. It's on the list, already ticked.
  7. **Complete trip ({n})**: pick a shop, check the prefilled prices, and save. The ticked items leave the list. Stock goes up, and the purchases appear in **Log purchases** for that shop and day.
  8. Make an item "Sold by weight or volume" with **L**. Log 2 L for R40, then 5 L for R85. **Prices** shows R20.00 and R17.00 per L.
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch.

## Deferred (not in phase 4)

- Fuel, toll, other trip costs, delivery and the trip row (`trip_id`) come in phase 5 (spec 4.6).
- The DESIGN_SPEC floating pill tab bar, and the Scan and Prices tabs, come in phase 6 or 8.
- Special and emergency flags on Complete trip rows: edit the purchase afterwards.
- Under/over-buy suggestions (5.4) come in phase 6.
- The usage history chart on the item screen (handover screen 4) comes in phase 6. Phase 4 shows the explanation line only.
