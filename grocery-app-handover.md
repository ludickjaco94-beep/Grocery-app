# Grocery Planner: Handover for Claude Code

## 1. Purpose

A personal mobile app (one user, one phone, offline-first) that:

1. Tracks stock of household groceries.
2. Learns real monthly usage per item.
3. Generates a **monthly bulk-buy list** that is always up to date and sized to real usage: no under-buying (forced back to the expensive local shop) and no over-buying (wasted capital, spoilage).
4. Records price and store for every purchase, so the user can verify whether the monthly city trip actually saves money after fuel and tolls.

The user is NOT a developer. Keep setup simple, explain commands, and finish and test each phase before starting the next.

## 2. Tech stack (fixed unless a blocker appears)

- Expo (React Native) + TypeScript, Expo Router for navigation
- `expo-sqlite` for local storage (no backend, no accounts)
- Zustand or plain React context for state; keep it simple
- Target device: Android phone. Use Expo Go on Android for early testing only.
- Expo Go needs the dev server running on the computer, so it cannot be the daily-use version. Phase 6 must produce an installable APK (EAS Build with a `preview` profile and `android.buildType: "apk"`), so the app runs in the shop with no computer. Explain the EAS account and build steps to the user in plain language.
- Respect the Android back button on every screen, and use the Android share sheet for CSV export.
- Currency symbol is a setting (default `R`); all money stored as integer cents
- CSV export/import for backup (phase 6)
- No receipt scanning in v1 (see Phase 7)

## 3. Core design decision: usage comes from stock counts, not per-use taps

Do NOT require the user to log every time they use something. That will be abandoned within two weeks.

Usage is derived:

`usage over a period = starting stock + bought − ending stock`

The user does a quick **stock-take** (a fast screen: one row per item, tap +/− or type the number left) right before each monthly trip. The app computes usage from that. Manual "used" and "add/remove stock" adjustments must still exist for corrections, but they are optional.

## 4. Data model (SQLite)

```
items
  id, name, unit (e.g. kg, L, pack, each), category,
  buy_mode ('monthly' | 'as_needed'),
  buffer_pct (default 10),            -- safety margin on top of average usage
  max_months_cover (default 2),       -- cap to avoid over-buying/spoilage
  est_monthly_usage (nullable),       -- manual estimate used until real data exists
  active (bool), created_at

stores
  id, name, is_city (bool), notes

purchases
  id, item_id, store_id, date,        -- store and date are required; date defaults to today, editable
  quantity, total_price_cents,        -- unit price = total / quantity
  trip_id (nullable),
  is_emergency (bool),                -- bought locally because we ran out
  is_special (bool, default false),   -- limited-time offer / promotion price
  regular_price_cents (nullable),     -- normal shelf price per unit at that store, if known
  special_note (nullable)             -- e.g. "3 for 2", "week-end deal"

stock_counts
  id, item_id, date, quantity, source ('stocktake' | 'adjustment' | 'purchase')

trips
  id, date, store_id,
  fuel_cents, toll_cents, parking_cents, other_cents,
  notes

settings
  currency_symbol, default_buffer_pct, usage_window_months (default 3)
```

Renaming an item only edits `items.name`. History must stay linked by `id`. Deleting an item should archive it (`active = false`), not destroy history.

## 5. Key logic

### 5.1 Average monthly usage (per item)

- Compute usage between consecutive stock-takes: `start + bought − end`, normalised to a 30-day month.
- Use a rolling average over the last `usage_window_months` (default 3).
- If fewer than 2 stock-takes exist, fall back to `est_monthly_usage`. If that is also empty, mark the item "needs data" and do not guess.

### 5.2 Suggested buy quantity (monthly items)

```
target = avg_monthly_usage × (1 + buffer_pct/100)
cap    = avg_monthly_usage × max_months_cover
to_buy = clamp(target − current_stock, 0, cap − current_stock)
```

Round up to a sensible pack size if the item has a pack size field (add `pack_size` nullable to `items`).

### 5.3 As-needed items

Shown in a separate section. The user can add them manually to the list; they are never auto-sized.

### 5.4 Learning from mistakes

- **Under-buy detection**: if an item hits 0 before the next trip, or a purchase is flagged `is_emergency`, show "You ran out of X. Raise the buffer from 10% to 20%?" Suggest only; the user confirms.
- **Over-buy detection**: if leftover at stock-take exceeds ~50% of a month's usage for 2 consecutive months, suggest lowering the buffer or the cap.
- The shopping list screen shows a running **total estimated cost** (using last known city unit price per item) so the user can see how much capital the trip ties up.

### 5.5 Savings verification (the "does this really save money" screen)

All comparisons use NORMAL prices (see 5.6), never special prices, so a one-off promotion cannot make the city look cheaper than it structurally is.

For each completed trip and each month:

```
basket_city   = Σ (quantity × normal city unit price)
basket_local  = Σ (quantity × normal local unit price for the same item)
gross_saving  = basket_local − basket_city
trip_cost     = fuel + toll + parking + other
net_saving    = gross_saving − trip_cost
emergency_cost_penalty = Σ extra paid on emergency local purchases that month vs city price
true_net      = net_saving − emergency_cost_penalty
```

Show: net saving per trip, per month, running total, and a **break-even** line ("this trip needs R___ gross saving to cover its costs"). Flag items where the local price is actually cheaper than the city price. Items lacking a local price are excluded from the comparison and listed as "no local price recorded" so the number is not silently inflated.

An optional "value of my time" setting (hourly rate × trip hours) can be added to the trip cost, default 0.

### 5.6 Special offers (limited-time prices)

The user does not want promotions to make something look cheaper than it normally is. Rules:

- Every purchase form has a clearly visible **Special** toggle (default off). When on, show an optional "Normal price" field and an optional note.
- **Normal price** of an item at a store = the median unit price of its last 3 non-special purchases at that store (fall back to the most recent one). A special price is never used as a normal price.
- If a purchase is marked special and the normal price field is blank, use the stored normal price for that item and store. If none exists, exclude the purchase from price comparisons and list it under "needs a normal price".
- These always use normal prices: store price comparison, price-history chart, shopping-list estimated cost, and the savings screen (5.5). Specials stay visible in history with a SPECIAL badge and a hollow chart marker.
- Report special gains separately: `special_gain = Σ (normal unit price − paid unit price) × quantity`. Show it as its own line ("Specials saved R__ this month, not counted in the structural saving"). This separates "the city is structurally cheaper" from "I got lucky on a deal".
- Specials never raise the suggested buy quantity. The user may manually override a quantity, but the `max_months_cover` cap applies and the app warns when the override exceeds it, because over-buying on a special is how savings get wasted.

Purchase form fields: item, store (required, with inline "add new store"), date (default today), quantity, price paid (total or per unit, user's choice), Special toggle, normal price (only shown when Special is on), Emergency toggle.

## 6. Screens

1. **Shopping List** (home): monthly list with suggested quantities, estimated total, section for as-needed items, tick-off while shopping, "complete trip" button that converts ticked items to purchases (asks for the actual price per item, prefilled with the last price).
2. **Items**: search, add, rename, archive, set buy mode, unit, buffer, cap, estimate.
3. **Stock-take**: fast one-row-per-item counter, grouped by category, saves a dated count.
4. **Item detail**: usage history chart, price history per store, average usage, suggested quantity explained ("Used about 4.2/month, buffer 10%, you have 1 left, buy 4").
5. **Trip**: log fuel, toll, parking; store chosen; items bought with prices.
6. **Savings**: per trip and per month, with break-even and the flagged items.
7. **Settings**: currency, default buffer, usage window, stores, CSV export/import.

## 7. Build phases

Finish, run, and test each phase on a real phone before moving on. Commit after each phase.

1. **Skeleton**: Expo + TS + SQLite schema + migrations; Items screen (add, rename, archive, buy mode, unit).
2. **Stock**: stock-take screen, manual add/remove, count history.
3. **Purchases & stores**: log purchases with price, store, date and the Special toggle (5.6); price history per item per store, specials badged.
4. **Usage engine & shopping list**: sections 5.1 to 5.3, the list screen, estimated total.
5. **Trips & savings**: trip costs, sections 5.5 and 5.6, break-even, flagged items, separate special-gain line.
6. **Polish & safety**: learning suggestions (5.4), CSV export/import, empty states, seed data for testing, installable Android APK.
7. **Optional, only if manual entry proves too slow**: receipt scanning. Preferred approach is a vision model API behind a tiny proxy so the API key is never shipped in the app. Slips use abbreviated item names, so matching needs a mapping table (`slip_alias` → `item_id`) that the user confirms once and the app remembers.

## 8. Definition of done (v1)

- User can add 30+ items, do a stock-take in under 3 minutes, and see a sensible shopping list after two stock-takes.
- Renaming an item keeps its full history.
- A completed trip shows net saving after fuel and tolls.
- Works fully offline, installed as an APK on the user's Android phone.
- A purchase marked Special never changes an item's normal price, the store comparison or the break-even figure.
- Data survives app restarts; CSV export works.

## 9. Open questions for the user (ask before Phase 1)

- Rough number of items to track?
- Any items sold by weight with variable pack sizes?
- Does the user want a household/second-user mode later? (Assume no.)
