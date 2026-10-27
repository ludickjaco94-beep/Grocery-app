# Phase 5a: Trips & Savings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every city shopping day becomes a **trip** with fuel, toll, parking and an Other cost (with a note). A Savings tab shows whether each trip and each month really saved money compared with local shops: net of trip costs, with emergencies counted, and with special gains on a separate line.

**Architecture:**
- Pure savings maths lives in `src/savings/savingsRules.ts` and is unit-tested.
- Trips are written by `src/trips/tripRepo.ts`.
- `insertPurchase` / `updatePurchase` attach any purchase at a city shop to that day's trip, creating the trip if needed. So Log purchases, Complete trip and edits all stay consistent.
- New routes:
  - A third tab, `(tabs)/savings.tsx` (trips, months, running total).
  - `/trips/[id]` (costs and breakdown).
- Complete trip gains a trip-costs section for city shops.

**Tech Stack:** The phase 4.5 stack. No new dependencies.

**Spec:** [grocery-app-handover.md](../../../grocery-app-handover.md) 5.5 and 5.6; [2026-10-26-grocery-planner-design.md](../specs/2026-10-26-grocery-planner-design.md) 4.2 (kg totals) and 4.6 (Other cost). Owner decisions (2026-10-27):
- The local price is the **cheapest local normal price**.
- **One trip can cover several city shops** on the same day.
- Fuel is a **rand amount**.
- Delivery orders are **phase 5b** and are not in this plan.

## Global Constraints

- **A trip is one per calendar day of city shopping.**
  - `trips.date` = the start of that day (`dayRange(day)[0]`).
  - `trips.store_id` stays null, because a trip can span several city shops.
  - Every purchase at an `is_city` store on that day gets that trip's `trip_id`. Purchases at local shops never have one.
  - Trips are never deleted.
- **Trip cost** = `fuel_cents + toll_cents + parking_cents + other_cents`. Each is blank → 0, entered with `parseMoney`. `trips.notes` holds the Other note.
- **Normal price** (5.6) per item per store = `normalPrice()` from `purchaseRules`, applied to that store's purchases.
  - The **city normal** of a trip purchase is the normal price at the store it was bought at.
  - The **local normal** of an item is the lowest normal price across non-city stores.
- **Trip savings (5.5):**
  - `basket_city = Σ qty × cityNormal` and `basket_local = Σ qty × localNormal`, over the trip's purchases that have **both** prices.
  - `gross = local − city`, `net = gross − trip cost`.
  - The break-even line reads `This trip needs {money(trip cost)} gross saving to cover its costs`.
  - **Excluded and listed:**
    - "no local price recorded" (no local normal).
    - "needs a normal price": a special with no `regular_price_cents` and no city normal.
  - **Flagged:** items whose local normal is below the city normal, shown as `cheaper locally`.
- **Special gain** = Σ over special purchases of `(normal − paid unit) × qty`. Normal is `regular_price_cents ?? city normal at that store`. Specials with neither are listed under "needs a normal price". Special gain is shown on its own line, `Specials saved {money} (not counted in the saving)`, and is never added to net.
- **Month (by trip date):** `net` = Σ trip nets. Its emergency penalty = Σ over that month's `is_emergency` purchases of `max(0, paid unit − lowest city normal) × qty`. Purchases with no city normal are skipped. `true_net = net − penalty`. The running total is Σ `true_net` over all months.
- **Weight totals (spec 4.2):** a trip and a month show the total kg bought per sold-by-measure kg item, plus a combined total for the Meat category. L items show L totals, but have no category total.
- **Specials never raise suggestions (5.6).** Raising a list quantity above the item's cap (`perMonth × max_months_cover − stock`) asks `That's more than {cap} months of stock. Keep it?` first.
- Money is cents, colours come from the theme, there's one accent per screen (none new), `Link asChild` takes a single style object, and owner commands use `npx.cmd`.

## Review Focus

1. **A special must not inflate the structural saving:** a city special at R10 with normal R14 versus local R15 counts as a R1 saving per unit in gross, plus a R4 special gain. → Task 1 test `tripSavings uses the normal price for specials`.
2. **No local price:** an item bought only in the city is excluded from both baskets and listed, never counted as a saving of its full price. → Task 1 test `tripSavings excludes and lists items without a local price`.
3. **Two city shops on one day are one trip,** with fuel counted once. → Task 2 test `tripDay groups two shops on the same day`.
4. **An emergency local buy dearer than the city** reduces the month's true net. One cheaper than the city doesn't add to it. → Task 1 test `monthSavings counts only the extra paid on emergencies`.
5. **Editing a purchase from a city shop to a local shop** detaches it from the trip. Moving it to another day moves it to that day's trip. → Task 2 test `tripIdFor` cases.

---

### Task 1: Savings rules

**Files:**
- Create: `src/savings/savingsRules.ts`
- Test: `src/savings/savingsRules.test.ts`

**Interfaces:**
- Consumes: `normalPrice`, `unitPriceCents` (purchases).
- Produces:
  - `type P = { id: string; item_id: string; store_id: string; is_city: number; date: string; quantity: number; total_price_cents: number; is_special: number; is_emergency: number; regular_price_cents: number | null }`
  - `normalsByStore(purchases: P[]): Map<string, number>`, keyed `${item_id}|${store_id}`.
  - `localNormal(itemId: string, normals: Map<string, number>, stores: { id: string; is_city: number }[]): number | null`. The lowest over non-city stores.
  - `tripSavings(tripPurchases: P[], allPurchases: P[], stores: {id; is_city}[], tripCostCents: number)` returns `{ basketCity; basketLocal; gross; net; breakEven; specialGain; noLocal: string[]; needsNormal: string[]; cheaperLocally: string[] }`. The arrays hold item ids, and all money is in cents and rounded once.
  - `monthSavings(trips: { net: number; specialGain: number }[], monthPurchases: P[], allPurchases: P[], stores)` returns `{ net; penalty; trueNet; specialGain }`.
  - `weightTotals(purchases: (P & { unit: string; sold_by_weight: number; category: string })[]): { perItem: { item_id: string; unit: string; total: number }[]; meatKg: number }`.
  - `monthKey(iso: string): string`, giving `'2026-10'` in local time.

- [ ] **Step 1: Write the failing tests** (city store `c`, local stores `l1` and `l2`):
  - `normalsByStore uses the median of the last 3 non-specials per store`.
  - `localNormal takes the cheapest local`: l1 normal 1500, l2 normal 1400 → 1400. With no local purchases → null.
  - `tripSavings basic`:
    - Rice, 2 at the city normal 2500 versus local 3000 → basketCity 5000, basketLocal 6000, gross 1000.
    - With trip cost 600 → net 400, breakEven 600.
  - `tripSavings uses the normal price for specials`: a special at 1000 with `regular_price_cents` 1400, versus local 1500, qty 1 → gross 100, specialGain 400.
  - `tripSavings excludes and lists items without a local price`.
  - `tripSavings lists a special with no normal price under needsNormal` and leaves it out of the baskets and the gain.
  - `tripSavings flags items cheaper locally`.
  - `monthSavings counts only the extra paid on emergencies`:
    - Emergency 1 at 2000 versus a city normal of 1500 → penalty 500.
    - Emergency at 1200 versus 1500 → 0.
    - trueNet = net − penalty, and specialGain is summed separately.
  - `weightTotals sums kg per item and Meat`: 1.25 kg + 0.75 kg of mince (Meat) and 2 kg of chicken (Meat) → meatKg 4. L items are listed with no meat total.
  - `monthKey`.
- [ ] **Step 2:** Run `npx jest src/savings`. Expected: it fails because the module is not found.
- [ ] **Step 3:** Implement `savingsRules.ts`.
- [ ] **Step 4:** Run `npx jest` and `npx tsc --noEmit`. Expected: all pass, clean.
- [ ] **Step 5: Commit**: `git commit -m "feat: savings rules (baskets, net, break-even, specials gain, emergency penalty, kg totals)"`

### Task 2: Trips and purchase attachment

**Files:**
- Create: `src/trips/tripRules.ts` (+ test), `src/trips/tripRepo.ts`
- Modify: `src/purchases/purchaseRepo.ts`

**Interfaces:**
- **`tripRules.ts`:**
  - `tripDay(iso: string): string`, which is `dayRange(iso)[0]`.
  - `tripIdFor(p: { date: string; is_city: number }, tripsByDay: Map<string, string>): string | 'new' | null`. Returns null for a local shop, the existing id for that day, or `'new'`.
  - `type CostForm = { fuel: string; toll: string; parking: string; other: string; note: string }`
  - `validateCosts(f: CostForm): { ok: true; values: { fuel_cents; toll_cents; parking_cents; other_cents; notes: string | null } } | { ok: false; errors: Partial<Record<keyof CostForm, string>> }`. Blank is 0. A bad entry gives `Enter an amount like 480 or 480,50`.
  - `tripCost(t: { fuel_cents; toll_cents; parking_cents; other_cents }): number`.
- **`tripRepo.ts`:**
  - `ensureTrip(tx, dateIso): Promise<string>`, which finds the trip for that day or creates one with zero costs.
  - `updateTripCosts(id, values)`.
  - `TRIPS_SQL`: trips newest first, each with its shop names (`GROUP_CONCAT` of the distinct stores of its purchases) and purchase count.
- **`purchaseRepo`:**
  - `insertPurchase` and `updatePurchase` read the store's `is_city` inside the transaction.
  - A city purchase sets `trip_id = await ensureTrip(tx, date)`. Otherwise it sets `trip_id = NULL`.
  - `trip_id` joins the written fields.

- [ ] **Step 1: Write the failing tests:**
  - `tripDay groups two shops on the same day`: 09:00 and 15:00 on the same day give the same key.
  - `tripIdFor` cases:
    - Local → null.
    - City with an existing trip that day → its id.
    - City on a new day → `'new'`.
  - `validateCosts`: blanks → zeros and `notes: null`, `'480,50'` → 48050, `'abc'` → an error on that field.
  - `tripCost` sums the four costs.
- [ ] **Step 2:** Run `npx jest src/trips`. Expected: it fails because the module is not found.
- [ ] **Step 3:** Implement `tripRules`, `tripRepo` and the `purchaseRepo` changes. `ensureTrip` uses `tripDay`.
- [ ] **Step 4:** Run `npx jest`, `npx tsc --noEmit` and `npx expo lint`. Expected: all pass, clean.
- [ ] **Step 5: Commit**: `git commit -m "feat: trips; city purchases attach to that day's trip"`

### Task 3: Trip costs on Complete trip and the trip screen

**Files:**
- Modify: `src/app/trip/complete.tsx`, `src/list/listRepo.ts`
- Create: `src/app/trips/[id].tsx`

- [ ] **Step 1: Complete trip.**
  - When the chosen store `is_city`, show a "Trip costs" section: Fuel, Toll, Parking, and Other with an "Other note" field. They're prefilled from that day's trip if one exists, with the caption `Adds to today's trip` (or the day's label).
  - On save, `completeTrip` also writes the costs to `ensureTrip(tx, date)` in the same transaction. Cost errors show under their fields and block the save.
- [ ] **Step 2: `/trips/[id]`.**
  - The editable cost fields with Save (`usePreventRemove`, with `allowLeave` before `router.back()`).
  - A savings card:
    - **Net saving** in 24 semibold tabular digits, `positive` if ≥ 0, else `danger`.
    - Then gross, the trip cost, the break-even line, and the special-gain line.
  - Lists for "cheaper locally", "no local price recorded" and "needs a normal price" (item names).
  - Weight totals.
  - The purchases of the trip as `ItemCard`s linking to `/purchase/{id}`.
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Regenerate typed routes if needed. Expected: clean.
- [ ] **Step 4: Commit**: `git commit -m "feat: trip costs on Complete trip; trip screen with savings breakdown"`

### Task 4: Savings tab

**Files:**
- Create: `src/app/(tabs)/savings.tsx`
- Modify: `src/app/(tabs)/_layout.tsx` (a third tab, "Savings", icon `piggy-bank-outline`)

- [ ] **Step 1:**
  - Header: the **running total** (`true_net` over all months) in 24 semibold tabular digits.
  - Then one card per month, newest first:
    - Month name.
    - `Saved {net}` and `Emergencies cost {penalty}` (shown when it's > 0).
    - `True saving {trueNet}`, plus `Specials saved {gain} (not counted)`.
    - Meat kg (when it's > 0).
  - Under each month, its trips as `ItemCard`s, linking to `/trips/{id}`: date, shops, and net.
- [ ] **Step 2:** Empty state: `No city trips yet. Shop at a city shop and they'll show here.`
- [ ] **Step 3:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean.
- [ ] **Step 4: Commit**: `git commit -m "feat: savings tab with months, trips and running total"`

### Task 5: Cap warning on list overrides

**Files:**
- Modify: `src/app/(tabs)/list.tsx`

- [ ] **Step 1:** For item entries with known usage, compute `cap = roundQty(perMonth × max_months_cover − (stock ?? 0))`. For group entries, use the group's equivalent from `byGroup` (perMonth × cap − stock). When + or a typed quantity would exceed the cap, ask `That's more than {max_months_cover} months of stock. Keep it?` (Keep / Cancel) before saving. This needs `max_months_cover` exposed on `ItemUsage`, so add `cap: number | null` to `ItemUsage` and `GroupUsage` in `useUsage`.
- [ ] **Step 2:** Run `npx tsc --noEmit`, `npx expo lint` and `npx jest`. Expected: clean.
- [ ] **Step 3: Commit**: `git commit -m "feat: warn when a list quantity goes over the months-of-stock cap"`

### Task 6: Verify, review, phone check

- [ ] **Step 1:** Run `npm test`, `npx tsc --noEmit`, `npx expo lint` and `npx expo-doctor`. Expected: all pass and clean.
- [ ] **Step 2:** One fresh reviewer (most capable model) reviews the branch against this plan, the spec and the Review Focus. Fix what it confirms, then rerun Step 1.
- [ ] **Step 3:** Owner phone checks:
  1. **Log purchases** at a *local* shop: rice 1 at R30. There's no trip, and the Savings tab is still empty.
  2. **List → tick rice → Complete trip** at Makro (city): rice 1 at R25, fuel R400, toll R80. The Savings tab shows October with one trip.
  3. Open the trip. Gross is R5.00, the trip cost is R480.00, the net shows −R475.00 in red, and the line reads "needs R480.00 gross saving".
  4. Log a second city shop on the same day (Log purchases). It joins the same trip, and fuel isn't counted twice.
  5. Log a city special: an item at R10 with normal R14, plus a local purchase of it at R15. The trip shows +R1.00 in gross for it, and "Specials saved R4.00 (not counted in the saving)".
  6. Log an emergency at a local shop for more than the city price. The month shows "Emergencies cost R…", and the true saving drops.
  7. Raise a list item's quantity far above normal. The app asks "That's more than 2 months of stock. Keep it?".
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch.

## Deferred

- Delivery orders (spec 4.6) are phase 5b.
- The "value of my time" setting (5.5, default 0) comes with Settings in phase 6.
- The price-history chart with hollow markers for specials comes in phase 6.
