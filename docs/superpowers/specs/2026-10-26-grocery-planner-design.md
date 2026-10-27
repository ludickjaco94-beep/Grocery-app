# Grocery Planner: Design

Date: 2026-10-26
Base spec: [grocery-app-handover.md](../../../grocery-app-handover.md). Everything in the handover stands unless this doc overrides it. Where they conflict, this doc wins.

## 1. Intent

A personal Android app that tracks household grocery stock, learns real monthly usage from stock-takes, sizes a monthly bulk-buy list, and proves whether the monthly city trip really saves money after fuel and tolls. The owner is not a developer.

New since the handover: a second person in the same household shops with the owner, on their own phone, and both see the shopping list ticks live.

## 2. Goals, non-goals, anti-goals

**Goals:** everything in handover section 8, plus:
- Weight-sold items (meat especially) show price per kg and total kg bought.
- Two phones share one household's data, with live ticks while shopping together (phase 7).

**Non-goals:** iPhone, web version, more than one household, receipt scanning before phase 8.

**Anti-goals** (failure even if it works):
- Logging every use of an item.
- Specials making the city look structurally cheaper.
- Sync losing or duplicating a tick, a purchase or a stock count. Accurate numbers are the app's whole job.
- Setup the owner can't follow.

## 3. Approaches

### 3.1 App stack (picked: Expo)

| Option | Trade-off |
|---|---|
| **Expo (React Native + TypeScript)** ✅ | Test on the phone via Expo Go with no Android Studio; EAS builds the APK in the cloud. Needs a free Expo account; free builds queue. |
| Native Kotlin + Jetpack Compose | Best Android fit, no build service. Needs Android Studio (10+ GB), slower edit/test loop, hard Gradle errors. |
| Flutter (Dart) | Smooth UI, iPhone-ready. Still needs a local Android SDK; less common language. |

Dropped: home-screen web app (browser may wipe data), no-code builders (online-only, can't do the maths).

**Why Expo:** least setup for a non-developer, fastest feedback on the real phone.

### 3.2 Sharing / sync (picked: Supabase + PowerSync)

| Option | Trade-off |
|---|---|
| **Supabase + PowerSync** ✅ | Keeps on-phone SQLite, so the handover's data model and maths stay. Built for offline-first sync with conflict handling. Two free accounts. Works in Expo Go via a JS adapter. |
| Firebase Firestore | One service, live updates. Replaces SQLite, so storage and maths get rewritten; weaker offline in Expo Go. |
| Supabase + hand-written sync | One account. Custom sync is where lost/duplicated rows come from: bad fit for an accuracy app. |

**Why PowerSync:** the owner shops with signal gaps; ticks must queue offline and catch up, and this is what PowerSync does out of the box.

## 4. Decisions (overrides and additions to the handover)

### 4.1 Local storage: PowerSync from phase 1

- Replaces `expo-sqlite`. Use `@powersync/react-native` as the local database from phase 1, **local-only** (not connected to any backend) until phase 7. Phases 1–6 stay fully offline with no accounts, as the handover requires.
- In Expo Go, use `@powersync/adapter-sql-js`; in development builds and the APK, use the native OP-SQLite adapter. Switch on `Constants.executionEnvironment === "storeClient"` (pattern from PowerSync's Expo Go docs).
- All `id` columns are UUID text generated on the phone (PowerSync requirement; also makes two-phone merging safe).
- The schema is declared in code via PowerSync's schema. The handover's "migrations" step in phase 1 becomes "define the PowerSync schema".
- Every `stock_counts` row is the **stock level after** that event, never a delta. Current stock = the item's latest row by `date` (full ISO timestamp). Adjustments and (from phase 3) purchases write a new row with the new level; usage (5.1) reads only `stocktake` rows plus purchases between them. Decided at phase 2 planning.
- Archiving (`active = false`) stays the only delete for items. Purchases, stock counts and trips are never hard-deleted silently.

### 4.2 Weight-sold items

- Add `items.sold_by_weight` (bool, default false). When on, the unit is fixed to kg.
- Quantities stay decimal (kg to 3 decimals). Money stays integer cents.
- Purchase form for weight items: enter weight in kg and total price paid; show price per kg live as they type.
- Everywhere a unit price shows for a weight item (price history, store comparison, item detail, shopping list estimate, savings), it shows **per kg**. Normal price (handover 5.6) is computed per kg.
- Trip screen and the monthly savings view show **total kg bought** per weight item, plus a combined total for the Meat category.
- Shopping list suggests a weight ("buy about 4.0 kg"), rounded up to 0.1 kg. Pack-size rounding (handover 5.2) never applies to weight items.
- **Stock-take for weight items offers both modes on every weight item:** type kg left (an estimate), or count packs left. A packs count is converted to kg using the average kg per pack across that item's purchases in the usage window. Add `purchases.pack_count` (nullable int) so that average can be computed; the weight purchase form asks for it as an optional field. If no pack-count data exists yet, the packs mode is disabled with a hint ("log pack counts on purchases to enable"). The stock count is always saved in kg; also save `stock_counts.entered_packs` (nullable) so the original entry stays visible.

### 4.3 Shopping list ticks are stored rows

Required for live sharing, so build it this way in phase 4:

```
list_entries
  id, item_id, quantity (suggested or user override), added_manually (bool),
  ticked (bool), ticked_at, ticked_by (nullable until phase 7)
```

- Ticking writes to this table, not to memory, so ticks survive an app restart even before sharing exists.
- "Complete trip" converts ticked entries to purchases (handover screen 1) and clears them.
- While shopping, the owner can create a brand-new item straight from the checklist. It opens the item form, saves the item, and adds it as a ticked `added_manually` entry (owner request, 2026-10-26).

### 4.4 Sharing (phase 7)

- **Backend:** Supabase (Postgres + login) and PowerSync Cloud, free tiers. Check current free-tier limits at the start of phase 7.
- **Login:** Supabase email login. One-time setup per phone; the app then stays signed in.
- **Household:** add `household_id` to every table. The owner creates the household; the second person joins with an invite code. Supabase row-level security limits each user to their household. PowerSync sync rules select by `household_id`.
- **Upgrade path:** on first sign-in, existing local data is attached to the new household and uploaded. No data is re-entered.
- **Live ticks:** both phones see ticks within seconds when online. Offline ticks queue and upload when signal returns.
- **Conflicts:** last write wins per row (PowerSync default with Supabase). Acceptable because two people rarely edit the same row at the same second.
- **Complete trip:** either person can press it. The other phone sees the list clear and the purchases appear.
- **Settings:** currency, buffer, usage window and stores are shared household settings.
- The app keeps working fully offline after sharing is on.

### 4.6 Owner additions (2026-10-27)

- **Litres work like kg (phase 4).** `items.sold_by_weight` now means "sold by measure", with unit `kg` or `L`. Everything in 4.2 applies to L items as well. That covers the decimal quantity, the total paid with a live price per L, the optional bottle count, the packs mode in stock-take and rounding to 0.1. The reason: a bigger or smaller bottle, or a special, can work out cheaper, so prices must compare per L.
- **Other trip costs (phase 5).** Besides fuel, toll and parking, a trip has an **Other** cost with a short note (e.g. a meal on the road), because some trip costs come up that aren't usual ones. It uses `trips.other_cents` and `trips.notes`, and it counts in the break-even exactly like fuel.
- **Delivery from the city (phase 5).** A city order can be delivered instead of driven to. It arrives after a few days, and the fee is low or free. A trip gets `kind` (`'drive' | 'delivery'`) and `delivery_cents`. For a delivery, the trip cost is the delivery fee (plus Other), not fuel and toll, so the savings screen shows the bigger saving. Owner answers (2026-10-27):
  - **Stock goes up on delivery, not on order.** An ordered item is a pending purchase until it arrives. Its date (and its stock effect under 4.1) is the day it arrives.
  - **One order can arrive in parts.** Each line is marked delivered on its own, possibly on different days. A line can be part-delivered: for example, 6 ordered, 4 now, 2 later.
  - **The supplier can cancel a line before delivery, and it's refunded.** A cancelled line (or the undelivered rest of one) never touches stock or the savings. Its money doesn't count as spent. It stays visible on the order as "cancelled, refunded".
  - Phase 5 planning still decides the details: how a pending line is stored (likely a `status` of `'ordered' | 'delivered' | 'cancelled'` on purchases, or a separate `order_lines` table), and how the shopping list treats items still on order (likely as "on the way", not suggested again).

### 4.5 Phases (replaces handover section 7)

1–6: as the handover, with 4.1–4.3 above built in from the start.
7. **Sharing:** Supabase + PowerSync connection, login, household invite, live ticks, upgrade of existing data. Test with two real phones in the shop.
8. **Optional:** receipt scanning, exactly as handover phase 7.

Accounts the owner will need: Expo (phase 6), Supabase and PowerSync (phase 7). Each gets plain-language setup steps when its phase starts.

## 5. Builder's call (settle without asking)

- Exact screen layouts, charts library, state management (Zustand or context, per handover).
- Whether the per-kg price shows as "R189.90/kg" or similar formatting.
- Two stock-takes of the same item on the same day: the later one wins.
- Seed data contents for testing.

## 6. Answered by owner

- Weight-sold items: yes, especially meat; wants price per kg and total kg bought.
- Second user: yes, shops together with the owner; live shared list.
- Stock-take for meat: both modes available per item (kg estimate or pack count).
- Number of items to track: not asked; assume 30–150. Nothing in the design changes within that range.
