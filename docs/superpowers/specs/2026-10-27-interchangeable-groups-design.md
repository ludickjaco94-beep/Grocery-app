# Interchangeable groups: Design

Date: 2026-10-27. Phase "4.5", which comes before phase 5 (trips and savings). It builds on [2026-10-26-grocery-planner-design.md](2026-10-26-grocery-planner-design.md) and the shipped phase 4 (usage engine and shopping list).

## 1. Intent

The owner buys some things by need, not by brand:
- Juice or pre-mix.
- Energy drinks.
- Snacks.
- Spaghetti or macaroni.
- Toilet paper in 9- or 18-packs.

Within each need, they pick whichever option is cheapest per kg, per L or per roll at the time, and switch now and then for variety so nobody gets bored. Different people like different options. The owner has energy drinks they like, their partner likes about 5 others, and one is liked by both.

Today the app treats every product as separate. The list suggests each brand from its own history. Switching brands looks like "used none of the old one". And products in different sizes can't be compared fairly.

**Owner's words that matter:** "price per kg or L is very important to me". "Should be able to see what size pack is cheaper per roll". A plain Home item "means there is no interchangeable item".

## 2. Goals, non-goals, anti-goals

**Goals**
- The owner defines **groups** of interchangeable products. Each group is a *kind* plus *who it's for*: "Drinks · Jaco", "Drinks · Kids", "Snacks · Home", "Pasta · Home". The owner adds both the kinds and the people.
- A product can be in **several** groups. The drink both partners like is in both of their drink groups.
- Every group compares by one **base unit**: kg, L, or a count word such as "roll". Each product states how much of that unit **one of it holds or makes**. A can holds 0.5 L, a concentrate bottle makes 5 L, a bag holds 0.12 kg, and an 18-pack holds 18 rolls.
- The shopping list suggests the **group**, not a brand, and shows each option's latest price per base unit with the cheapest marked.
- Complete trip asks **which product(s)** from the group were bought. Each one becomes a normal purchase.

**Non-goals**
- No changes to stock-take: each product is still counted separately (owner confirmed).
- No per-person spending reports.
- No automatic "rotate for variety" nudges. The owner picks.

**Anti-goals**
- Groups must not replace or tangle with **categories**. Categories only sort the Stock screen. Groups mean "any of these will do".
- A product in no group behaves **exactly as today**.
- A shared product's use must not be counted twice. It's split evenly between its groups: **50/50 for two groups, with no override** (owner decision: "worst case you buy a few cans extra one month").

## 3. Constraints

- PowerSync, local-only. The schema is declared in code, and new tables and columns need no migration (spec 4.1). IDs are UUID text.
- Every rule in spec 4.1–4.3 and 4.6 still holds:
  - Stock rows are levels.
  - List entries are stored rows.
  - A sold-by-measure item (kg or L) has `quantity` in its unit.
- Money is integer cents, colours come from the theme, there's one accent per screen, and owner commands use `npx.cmd`.

## 4. Approaches

1. **Its own short phase now (picked).** Groups, contents, the list and Complete trip, about 3–4 hours of work. Phase 5's city-versus-local savings then compares by price per kg / L / roll, so it's built on this instead of redone.
2. Fold it into phase 5. That saves one review and phone check, but the phase is twice as big, problems are harder to pin down, and the owner waits longer.
3. Each item in only one group. This was rejected by the owner, because it can't model a drink both partners like.

## 5. Design (decided with the owner)

### 5.1 Data

```
items (new columns)
  contents_qty    real, nullable   -- how much one unit of this item holds or makes
  contents_unit   text, nullable   -- 'kg' | 'L' | a count word ('roll', 'can', 'sachet')

people            -- "who it's for"; Home is built in, like the categories
  id, name, created_at

groups
  id, kind (text, e.g. 'Drinks'), person (text, a people name or 'Home'),
  base_unit (text: 'kg' | 'L' | a count word),
  buy_mode ('monthly' | 'as_needed'), buffer_pct, max_months_cover,
  est_monthly_usage (nullable, in base units), active, created_at

group_items
  id, group_id, item_id

list_entries (new column)
  group_id        text, nullable   -- set for a group entry; item_id is then null
```

- A group's display name is `{kind} · {person}`. The pair `(kind, person)` is unique, ignoring case.
- **How much one item holds, in its group's base unit:**
  - A sold-by-measure item whose unit equals the base unit holds 1. 1 kg of macaroni holds 1 kg, and the owner never types it.
  - Otherwise it's `contents_qty`, and `contents_unit` must equal the base unit.
  - An item can only join a group whose base unit it can be measured in. The item screen refuses, with a message, otherwise.
- **Word units (owner, 2026-10-27, after the phone check):** an item's own unit can be a typed word, like "roll" or "can", stored lower-case. The owner logs toilet paper as rolls (48 at R190), so the price per roll is direct, whatever the pack size. Any item whose unit equals the group's base unit holds 1, the same as kg/L. Holds stays for items counted another way, such as a 553 ml can logged as "each" in a per-L group.
- **All of an item's groups share one base unit**, because `contents` is per item. The shared energy drink is L in both drink groups.

### 5.2 Usage, stock and suggestion for a group

For a group G, each member item i has a `share = 1 / (number of active groups i is in)` and a `holds(i)` from 5.1.
- **Monthly need** = Σ `usage(i).perMonth × holds(i) × share`, over the members with known usage. If no member has usage, use `G.est_monthly_usage`, else G is "needs data".
- **Stock** = Σ `stock(i) × holds(i) × share`. A never-counted member counts as 0.
- **Suggested amount** follows handover 5.2 with the group's buffer and cap, in base units.
- **The hint** is in the cheapest option's own size: `ceil(amount / holds(cheapest))` of it. For example "about 6 L (12 × Monster 500 ml)" or "about 30 rolls (2 × 18-pack)".
- **A member's own suggestion is suppressed.** An item in any active group never gets its own list row from Make list. Its need goes through the group(s). It can still be added by hand.

### 5.3 Price per base unit

- **Unit price per base unit** of item i = `LAST_PRICE_SQL unit_cents(i) / holds(i)`. That's the latest non-special city price, else the latest non-special anywhere.
- **The cheapest option** is the member with the lowest price per base unit. Members without a price are listed as "no price yet" and are never cheapest.
- **Prices screen (every item, grouped or not):** when an item has contents, or is sold by measure, each row and the Normal line also show the price per `contents_unit`. Toilet paper, for example, shows "R4.10 per roll". This is the owner's "which pack size is cheaper per roll".

### 5.4 Screens

- **Item screen:**
  - A "Holds" field: an amount plus unit chips kg / L / count. The count chip takes a word, defaulting to "each".
  - A "Groups" row of the item's groups, with add/remove.
  - It's hidden for sold-by-measure items, whose contents are implicit.
- **Groups screen** (`/groups`), reached from the List tab and from the item screen:
  - It lists the groups.
  - New group: pick or type a kind, pick or add a person (Home built in), pick the base unit, and set buy mode, buffer, cap and an optional estimate.
  - On a group: its members with their holds, add/remove members, and archive.
- **List:**
  - Make list also suggests groups, as one row per group: `{kind} · {person}`, with meta `about {amount} {base} ({n} × {cheapest name})` and the estimated cost.
  - Below a group row sit its options, each with its price per base unit, the cheapest one marked "cheapest", using `primary` text. No new accent.
  - Ticking works the same as for item rows.
  - As-needed groups appear in the As needed section with **Add**.
- **Complete trip:**
  - A ticked group row asks for **product chips (the group's members)**, quantity and total paid, plus **+ another product** for a mix.
  - It's prefilled with the cheapest member and `ceil(amount / holds)`.
  - Each line becomes a normal purchase of that item. Validation stays all-or-nothing.

### 5.5 Edge rules (settled after the builder check; designer's calls)

- **The group governs its members.** While an item is in any active group, the group's `buy_mode`, `buffer_pct` and `max_months_cover` apply, and the item's own are ignored. The item screen keeps those fields, with the caption `Set by {group name} while grouped`.
- **The share counts only active groups.** Archiving a group moves a shared item's use and stock fully to its remaining group. That's intended.
- **`holds` never uses `pack_size`, and the hint ignores it too.** The hint is just `ceil(amount / holds(cheapest))` in the item's own unit. For example "about 6 L (12 cans)", even when cans come in 4- or 6-packs (owner, 2026-10-27: "just say number of cans").
- **A group list entry stores `quantity` in the group's base unit.** Its estimated cost = `quantity × cheapest price per base unit`. If no member has a price, it counts as unpriced in the `n without a price` caption.
- **Make list / Refresh with groups.**
  - The rule from spec 4.3 carries over: ticked and hand-added entries are never touched, for item and group rows alike.
  - An unticked suggested item entry whose item is now in a group is removed on Refresh, because its need moved to the group.
  - A group that is archived, or left with no members, loses its unticked suggested entry on Refresh. A ticked one stays and can still be completed, using its last members.
- **"Needs data" groups** count in the List's existing `{m} monthly items need data` caption, which becomes `… items or groups …`.
- **Changing an item's contents unit, or its sold-by-measure switch, while it's in groups:** Save refuses with `Remove it from {group name} first` if the change would break that group's base unit.
- **Prices screen:** any item with `contents_qty` also shows the price per `contents_unit`. Sold-by-measure items already show per kg/L, and nothing extra is added.

## 6. Left to the builder

- Whether groups have their own categories or icons. Suggestion: a fixed group icon and no category.
- Exact layout of the group row and its options. Keep it compact, with a maximum of about 5 options shown and "+ n more".
- How "Home" is stored. Suggestion: a built-in name, not a row, the same as the built-in categories.
- Whether the hint rounds to the cheapest option or the most recent one bought. Use the cheapest.
- **Owner confirmed (2026-10-27):** the cheapest comparison ignores specials. A special is temporary, and it still shows in the item's Prices history.
