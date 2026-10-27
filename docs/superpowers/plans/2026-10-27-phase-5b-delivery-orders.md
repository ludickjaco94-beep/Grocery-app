# Phase 5b: Delivery Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A city order can be placed from the List and delivered later, in parts, with cancelled lines refunded. Stock goes up only on delivery, the List counts what is on the way, and the Savings tab treats the order as a trip whose cost is the delivery fee plus Other.

**Architecture:**
- An order is a `trips` row with `kind = 'delivery'`, `store_id` = the shop, `date` = the order day.
- Its lines live in a new `order_lines` table.
- Delivering a part writes an ordinary purchase through `insertPurchase`, dated the arrival day, with `order_line_id` and the order's `trip_id`. Every existing purchase query (stock, usage, prices, savings) therefore sees deliveries and nothing else, with no changes.
- Delivered quantity is never stored. It is `SUM(purchases.quantity) WHERE order_line_id = line`, so editing or deleting a delivered purchase keeps the order right by itself.
- Pure maths lives in `src/orders/orderRules.ts`, writes in `src/orders/orderRepo.ts`.
- New route: `/order/[lineId]` (deliver a part, or cancel the rest).
- Changed routes:
  - `/trip/complete?mode=order` becomes Place order.
  - `/trips/[id]` shows the order lines for a delivery.

**Tech Stack:** The phase 5a stack. No new dependencies.

**Spec:** [2026-10-26-grocery-planner-design.md](../specs/2026-10-26-grocery-planner-design.md) 4.6 (delivery from the city, owner answers 2026-10-27). Owner decisions (2026-10-27):
- Orders start **from the List**, with a "Place order" button next to Complete trip.
- Items on order are **subtracted from suggestions and shown as "N on the way"**.
- **No swaps.** A swapped item is logged as a cancel plus a normal purchase.

## Global Constraints

- **Line state:**
  - `delivered = Σ purchases.quantity` for the line.
  - `open = max(0, roundQty(quantity − delivered − cancelled_qty))`.
  - Status copy:
    - open > 0 and delivered = 0 → `on the way`.
    - open > 0 and delivered > 0 → `{delivered} of {quantity} delivered`.
    - open = 0 and cancelled = 0 → `delivered`.
    - open = 0 and delivered = 0 → `cancelled, refunded`.
    - otherwise → `{delivered} delivered, rest refunded`.
- **Money:**
  - A delivered part costs `Math.round(line.total_price_cents × part / line.quantity)`.
  - The refunded amount is `Math.round(total × cancelled_qty / quantity)`.
  - Cancelled money never becomes a purchase, so it never counts as spent or saved.
- **A delivery:**
  - Its quantity is > 0 and ≤ open.
  - It is a whole number unless the item is sold by measure.
  - Its day is on or after the order day. Messages: `Enter how many arrived`, `Only {open} still on the way`, `Use whole numbers`, `It can't arrive before it was ordered`.
- **"Cancel the rest"** sets `cancelled_qty = quantity − delivered` (the line's open amount). It asks first: `Cancel {open} {unit}? It counts as refunded.`
- **Trip cost** = `fuel + toll + parking + other + delivery_cents`.
  - A delivery order shows only the **Delivery fee**, **Other** and **Other note** fields.
  - A drive trip shows Fuel, Toll, Parking, Other and the note, as before.
  - Old trips have `kind` null, which is treated as `'drive'`.
- **`ensureTrip` only finds drive trips** (`kind IS NULL OR kind = 'drive'`), so a city purchase on the order day never joins the order.
- **A delivered purchase keeps its order's trip** on edit, even if its day or shop changes.
- **On the way, per item** = Σ open over all lines. The List uses it as follows:
  - Item suggestions use `stock + onWay`, and so does `capRoom`.
  - For a group member, `stock + onWay` feeds `groupNeed`.
  - "Running low" still uses the current stock only.
  - A row whose item has stock on the way adds `{n} {unit} on the way` to its meta.
  - A group row's meta shows the group's on-the-way amount in its base unit.
- **Orders on the List:** while any order has an open line, the List shows a row per order above the list, titled `Order from {shop} · {open lines} on the way`, linking to `/trips/{id}`.
- **Savings:**
  - Delivery orders appear among a month's trips by order date, with icon `cube-outline`, title `Order {tripTitle}` and meta = shop name.
  - They show even with no deliveries yet.
  - Their savings use only delivered purchases.
- Money is cents, colours come from the theme, there's one accent per screen (none new), `Link asChild` takes a single style object, `Chip` doesn't take `Link asChild`, and owner commands use `npx.cmd`.

## Review Focus

1. **Part delivered, then rest cancelled:** 6 ordered at R60, 4 delivered, then cancel the rest. The purchase is R40, the refund is R20, and stock rose by 4 only. → Task 1 tests `partPrice`, `lineState part delivered then cancelled`.
2. **A delivered purchase is deleted:** that line goes back to "on the way" for that amount, and the List counts it again. This follows from the derived `delivered`. → Task 1 test `lineState treats deleted deliveries as open again` (delivered passed as 0).
3. **Ordering on a day you also drive to the city:** the drive trip and the order stay separate, each with its own costs. → Task 2 rule in `ensureTrip`, phone check 6.
4. **An item is on order and also on the List:** suggestions drop by the open amount and never go negative. → Task 1 test `withOnWay`.
5. **A whole-unit item (cans) part-delivered as 2.5** is refused. → Task 1 test `validateDelivery`.

---

### Task 1: Order rules and delivery cost

**Files:**
- Create: `eekhoring/src/orders/orderRules.ts`, `eekhoring/src/orders/orderRules.test.ts`
- Modify: `eekhoring/src/trips/tripRules.ts` and its test

**Interfaces:**
- Produces:
  - `lineState(l: { quantity: number; delivered: number; cancelled_qty: number }): { open: number; status: string }`
  - `partPrice(totalCents: number, ordered: number, part: number): number`
  - `refundCents(l: { quantity: number; total_price_cents: number; cancelled_qty: number }): number`
  - `validateDelivery(text: string, open: number, soldByWeight: boolean, dayIso: string, orderDayIso: string): { ok: true; quantity: number } | { ok: false; error: string }`. Compare days with `dayRange(x)[0]`.
  - `withOnWay(stock: number | null, onWay: number): number | null`. Returns `stock` when onWay is 0, else `(stock ?? 0) + onWay`.
- `tripRules` changes:
  - `CostForm` gains `delivery: string`.
  - `CostValues` gains `delivery_cents: number`.
  - `validateCosts`, `costsToForm` and `tripCost` all include delivery.

- [ ] **Step 1: Write the failing tests**
  - `lineState on the way`: {6, 0, 0} → open 6, `on the way`.
  - `lineState part delivered`: {6, 4, 0} → open 2, `4 of 6 delivered`.
  - `lineState part delivered then cancelled`: {6, 4, 2} → open 0, `4 delivered, rest refunded`.
  - `lineState all cancelled`: {6, 0, 6} → `cancelled, refunded`.
  - `lineState delivered`: {6, 6, 0} → `delivered`.
  - `lineState treats deleted deliveries as open again`: {6, 0, 2} → open 4.
  - `lineState float noise`: {1.5, 0.7 + 0.8, 0} → open 0.
  - `partPrice`: (6000, 6, 4) → 4000; (1000, 3, 1) → 333.
  - `refundCents`: {6, 6000, 2} → 2000.
  - `validateDelivery`:
    - '' → `Enter how many arrived`.
    - '3' with open 2 → `Only 2 still on the way`.
    - '2.5' with soldByWeight false → `Use whole numbers`.
    - '2.5' with soldByWeight true, open 3 → ok 2.5.
    - A day before the order day → `It can't arrive before it was ordered`.
    - '2,5' parses like `parseDecimal` does elsewhere.
  - `withOnWay`: (null, 0) → null; (null, 4) → 4; (3, 4) → 7.
  - tripRules:
    - `tripCost includes delivery`: {0, 0, 0, 1000, delivery 5000} → 6000.
    - `validateCosts parses delivery`: '50' → 5000; 'x' → `Enter an amount like 480 or 480,50`.
    - Update the existing fixtures so they include `delivery`.
- [ ] **Step 2: Run them and see them fail.** Run `npx jest src/orders src/trips`. Expected: FAIL, because the module is not found and `delivery` is undefined.
- [ ] **Step 3: Implement.** Copy the strings exactly from Global Constraints. Use `roundQty` for open, and `parseDecimal` from `@/items/itemRules` for the text.
- [ ] **Step 4: Run them and see them pass.** Run `npx jest`. Expected: all pass.
- [ ] **Step 5: Commit.** `feat: order line rules and delivery fee in trip cost`

### Task 2: Schema and order repository

**Files:**
- Modify:
  - `eekhoring/src/db/schema.ts`
  - `eekhoring/src/purchases/purchaseRepo.ts`
  - `eekhoring/src/trips/tripRepo.ts`
  - `eekhoring/src/savings/useSavings.ts`
- Create: `eekhoring/src/orders/orderRepo.ts`

**Interfaces:**
- Schema changes:
  - `trips` gains `kind: text` and `delivery_cents: integer`.
  - `purchases` gains `order_line_id: text`, with index `order_line: ['order_line_id']`.
  - New table `order_lines`: `{ trip_id, item_id, quantity: real, total_price_cents: integer, cancelled_qty: real, created_at }`, with index `trip: ['trip_id']`.
- `insertPurchase` accepts an optional `order_line_id?: string | null`.
  - `withTrip`: when `order_line_id` is set, `trip_id` = that line's `trip_id`. Otherwise the existing rule applies.
  - `order_line_id` goes into `FIELDS`.
  - `updatePurchase` reads the old `order_line_id` and passes it into `withTrip`, so an edit keeps the link and the trip.
- `ensureTrip` only matches drive trips and inserts `kind = 'drive'`, `delivery_cents = 0`.
- `writeTripCosts` also writes `delivery_cents`.
- `moveCostsIfEmptied` also moves `delivery_cents`. It is a no-op for delivery trips, because a delivered purchase never changes trip.
- `TRIPS_SQL` also selects:
  - `kind` and `delivery_cents`.
  - `shops`: `COALESCE(<existing purchases subquery>, (SELECT name FROM stores WHERE id = t.store_id))`.
  - `open_lines`: the count of the trip's lines with open > 0.0001, where open = `quantity − cancelled_qty − COALESCE((SELECT SUM(quantity) FROM purchases WHERE order_line_id = l.id), 0)`.
- `TripRow` gains `kind: string | null; delivery_cents: number; open_lines: number`.
- `useSavings` shows a trip if `purchases > 0 || tripCost > 0 || kind === 'delivery'`.
- `orderRepo` exports:
  - `ORDER_LINES_SQL` (param trip id): `l.id, l.item_id, i.name, i.unit, i.sold_by_weight, l.quantity, l.total_price_cents, l.cancelled_qty`, and `delivered` from the SUM subquery, ordered by name.
  - `ON_WAY_SQL`: `item_id, SUM(open)` over all lines with open > 0, grouped by item.
  - `OPEN_ORDERS_SQL`: delivery trips with `open_lines > 0`, as `id, shop, open_lines`.
  - `placeOrder(storeId: string, date: string, rows: (PurchaseValues & { entryId: string; item_id: string })[], costs: CostValues): Promise<void>`. In one transaction it inserts a trip (`kind = 'delivery'`, `store_id`, `date = tripDay(date)`, costs), inserts one `order_lines` row per row with `cancelled_qty = 0`, and deletes each entry.
  - `deliverLine(lineId: string, quantity: number, date: string): Promise<void>`. It reads the line and its trip's `store_id`, then calls `insertPurchase(tx, { item_id, store_id, date, quantity, total_price_cents: partPrice(...), is_special: 0, regular_price_cents: null, special_note: null, is_emergency: 0, pack_count: null, order_line_id: lineId })`.
  - `deliverAll(tripId: string, date: string): Promise<void>`. It delivers every line's open amount in one transaction. It reuses an in-transaction helper `deliverIn(tx, lineId, qty, date)`, which `deliverLine` also uses.
  - `cancelRest(lineId: string): Promise<void>`. It sets `cancelled_qty = quantity − delivered`.

- [ ] **Step 1: Make the changes above.** Repository code has no unit tests here, matching `tripRepo` (ruling from 5a). Its maths comes from Task 1's tested rules.
- [ ] **Step 2: Fix the fixtures.** Update any test fixture that builds `TripRow`, `CostValues` or the item/purchase round-trip, so that `npx jest` passes.
- [ ] **Step 3: Verify.** Regenerate the typed routes on port 8090 (`CI=1 timeout 60 npx expo start --dev-client --port 8090`), then run `npx tsc --noEmit`, `npx jest` and `npx eslint src`. Expected: all clean.
- [ ] **Step 4: Commit.** `feat: order_lines table, delivery trips, deliveries become purchases`

### Task 3: Place order, and on the way on the List

**Files:**
- Modify:
  - `eekhoring/src/app/trip/complete.tsx`
  - `eekhoring/src/components/TripCostFields.tsx`
  - `eekhoring/src/app/(tabs)/list.tsx`
  - `eekhoring/src/usage/useUsage.ts`

**Interfaces:**
- Consumes: `placeOrder`, `ON_WAY_SQL`, `OPEN_ORDERS_SQL` and `withOnWay`.
- `TripCostFields` takes `kind: 'drive' | 'delivery'`. For `delivery` it shows the Delivery fee, Other and Other note fields.
- `ItemUsage` gains `onWay: number`. `GroupUsage` gains `onWay: number`, which is Σ member `onWay × holds`, in the base unit.

- [ ] **Step 1: Complete trip in order mode.** `complete.tsx` reads `mode` from `useLocalSearchParams`. When it is `'order'`:
  - The title is `Place order`, the day label is the order day, and the section heading is `Ordered`, not `Bought`.
  - The costs section is always shown, with heading `Delivery costs` and `kind="delivery"`. It doesn't prefill from the day's trip.
  - The save button reads `Place order ({n} lines)` and calls `placeOrder(storeId, purchaseDate(day, new Date()), result.values, costs.values)`.
  - The discard prompt reads `Discard this order?`.
  - The drive mode is unchanged apart from `kind="drive"`.
- [ ] **Step 2: List buttons.** Next to `Complete trip ({ticked})`, add `Place order ({ticked})`, disabled when nothing is ticked. Use `router.push({ pathname: '/trip/complete', params: { mode: 'order' } })`.
- [ ] **Step 3: Open orders on the List.** Above the list, render the open-orders rows from Global Constraints. Each row is an `ItemCard` with icon `cube-outline`, inside a `Link asChild` + `Pressable`, the same way the Savings tab renders trips.
- [ ] **Step 4: On the way in suggestions.**
  - In `useUsage`, load `ON_WAY_SQL`.
  - Pass `withOnWay(current, onWay)` as the stock to `suggestBuy`, `capRoom` and `groupNeed`. Keep `low` and `explain` on the current stock.
  - In the List row meta, add `{n} {unit} on the way` when onWay > 0. For a group row, use the group's onWay and base unit.
- [ ] **Step 5: Verify.** Regenerate the routes, then run tsc, jest and eslint. Expected: all clean.
- [ ] **Step 6: Commit.** `feat: place an order from the list; on-the-way stock counts in suggestions`

### Task 4: Delivering, cancelling, and orders in Savings

**Files:**
- Create: `eekhoring/src/app/order/[lineId].tsx`
- Modify: `eekhoring/src/app/trips/[id].tsx`, `eekhoring/src/app/(tabs)/savings.tsx`

**Interfaces:**
- Consumes: `ORDER_LINES_SQL`, `deliverLine`, `deliverAll`, `cancelRest`, `lineState`, `refundCents` and `validateDelivery`.

- [ ] **Step 1: Trip screen for a delivery.** When `trip.kind === 'delivery'`:
  - The title is `Order {tripTitle}`.
  - An `Order` section lists each line as an `ItemCard`:
    - The name, plus meta `{quantity} {unit} · {money(total)} · {status}`.
    - Add ` · {money(refund)} refunded` when the refund is > 0.
    - Lines with open > 0 link to `/order/{lineId}`.
  - Below the lines, an `Everything arrived today` button (outline) appears when any line is open. It calls `deliverAll(trip.id, new Date().toISOString())` through the guard.
  - The savings card shows `Delivery fee` instead of `Trip cost`. Its note reads `This order needs {money} gross saving to cover delivery`.
  - The costs editor uses `kind="delivery"`.
  - The purchases section heading is `Delivered`.
- [ ] **Step 2: The `/order/[lineId]` screen.** Its title is the item name. It shows the status line, plus:
  - A `Field` labelled `Arrived ({unit})`, prefilled with open.
  - A `DayStepper` that defaults to today.
  - A `PrimaryButton` labelled `Save delivery`. It runs `validateDelivery`, then `deliverLine`, then `router.back()`.
  - An outline `PrimaryButton` labelled `Cancel the rest`. It shows the confirm Alert from Global Constraints, then calls `cancelRest`, then `router.back()`.
  - Use the same `usePreventRemove` and `allowLeave` pattern as the trip screen, so a typed quantity asks before leaving.
- [ ] **Step 3: Savings tab.** Trip cards for delivery orders use icon `cube-outline` and name `Order {tripTitle}`. Add ` · {open_lines} on the way` to the meta when open_lines > 0.
- [ ] **Step 4: Verify.** Regenerate the routes, then run tsc, jest and eslint. Expected: all clean.
- [ ] **Step 5: Commit.** `feat: deliver order lines in parts, cancel with refund, orders in savings`

### Task 5: Owner phone check (about 15 minutes)

- [ ] **Step 1: Reload.** The owner reloads the app.
- [ ] **Step 2: Send the checks.**
  1. Tick 2 items on the List and tap **Place order** at a city shop. Enter cans 6 at R60, rice 2 at R50, delivery fee R30. The List shows `Order from … · 2 on the way`, and stock is unchanged.
  2. Tap **Make list / Refresh**. Cans show `6 … on the way`, and their suggestion drops by 6.
  3. Open the order and tap the cans line. Enter Arrived 4 and save. Cans stock is up by 4, and the line reads `4 of 6 delivered`.
  4. On the cans line, tap **Cancel the rest** and confirm. The line reads `4 delivered, rest refunded`, with R20 refunded.
  5. Tap **Everything arrived today**. Rice stock is up by 2, and the order leaves the List.
  6. On the order day, also log a normal city purchase. Savings shows a separate drive trip and the order, and the order's cost is R30.
  7. Delete the delivered rice purchase. The rice line goes back to `on the way`.
