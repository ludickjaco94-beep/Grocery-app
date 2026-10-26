# Design restyle (phase 2.5): design

Date: 2026-10-26
Visual source: [DESIGN_SPEC.md](../../../DESIGN_SPEC.md) with mood references `ref-leafora.png` and `ref-food-app.png` (mood only, never layouts).
Approved mockup: `.superpowers/brainstorm/2332-1793027980/content/stock-screens.html` (Stock dark, Stock-take dark, Stock light).
Builds on: phase 1 (items) and phase 2 (stock), both merged to `main`.

## 1. Intent

The owner wants the app to look calm and dark green, like the reference mood, while staying a fast one-handed tool in the shop. Numbers come first. This restyles the screens that exist now. It also brings in the shared look (theme file plus reusable pieces) so phases 3 to 6 build new screens in it from day one rather than restyling them later.

Fixed categories also come in now. The spec's category chips and icons need a known list, and free typing has already split "dairy" from "Dairy".

## 2. Goals

1. One theme file holds every colour, radius and spacing value from DESIGN_SPEC sections 2 and 3, in dark and light. No screen hard-codes a colour.
2. Dark and light follow the phone's setting and switch with no restart.
3. Every existing screen uses the theme: Stock (today's Items list, renamed), item add/edit, Stock-take, and Stock & history.
4. A fixed category list with icons. The owner can add their own categories. Category chips filter the Stock screen and the Stock-take screen.
5. The DESIGN_SPEC section 8 checklist passes on every restyled screen.

## 3. Non-goals (decided by the owner)

- **No Scan tab.** Receipt scanning stays the optional phase 8.
- **No delete.** Archive stays the only way to remove an item, so history is kept.
- **No tab bar yet.** It appears when a second tab exists (shopping list, phase 4). Stock is the home screen until then.
- **No − / + steppers on the Stock screen.** Counts change only in Stock-take and Stock & history, so a stray tap while scrolling can't change stock. This deliberately departs from DESIGN_SPEC 5.1 (ItemCard "stock count with stepper").
- No item photos or category pictures. Simple line icons now; nicer pictures can be a later plan.

## 4. Deferred to the phase that brings the data

| DESIGN_SPEC piece | Waits for |
|---|---|
| "last price" on the item card | Phase 3 (purchases) |
| SpecialToggle, accent "Special" tag | Phase 3 |
| "Running low" warning colour on stock numbers | Phase 4 (usage engine) |
| TotalBar, shopping list screen, BottomNav | Phase 4 |
| Prices / trip check screen | Phase 5 |
| Manual theme override (System / Dark / Light) | Phase 6 Settings screen |

## 5. Constraints

- Expo SDK 58, Expo Router, PowerSync local-only (spec 4.1). Follow `eekhoring/AGENTS.md`: use `npx expo install`, and check versioned docs.
- **No new native modules**, so no dev-client rebuild. Icons come from `@expo/vector-icons`, which is JS-only on top of the installed `expo-font`. Confirm in the SDK 58 docs before installing.
- DESIGN_SPEC rules: no blur. Touch targets 48dp or more. Body text 14sp or more, numbers 16sp or more and semi-bold, with tabular digits. Only one accent element per screen. Text contrast 4.5:1 or better in both modes.
- `app.json` already has `"userInterfaceStyle": "automatic"`.
- The Android back button and the existing unsaved stock-take prompt keep working.
- `Link asChild` children take a single style object, not an array (an expo-router render error hit in phase 2).

## 6. Approaches

1. **One theme file plus own small components (picked by the owner).** It holds the tokens from DESIGN_SPEC, uses a `useTheme()` hook on React Native's `useColorScheme`, and has six small reusable components. Nothing to install except icons, and no rebuild. It costs a little more code than a library.
2. A styling library (NativeWind / Unistyles). Shorter style code, but extra build setup. Unistyles needs a rebuild, and it's another moving part on Expo upgrades.
3. A component kit (React Native Paper). Ready-made pieces, but its Material look fights the custom style on every screen.

## 7. Decisions

### 7.1 Theme
- `src/theme/` holds the tokens exactly as DESIGN_SPEC section 7's example: `dark` and `light` colour sets, plus `radius = {card:20, button:16, chip:999, bar:24}` and `spacing = [4, 8, 12, 16, 24, 32]`. Add `warning`, `danger` and `positive` from the section 2 table.
- `useTheme()` returns the active set from `useColorScheme()`. Screens build styles from it. Nothing else in `src/app` or `src/components` contains a hex colour.
- The card is the "glass without blur" from DESIGN_SPEC 4: `surface` at 92% opacity, 1px `border`, radius 20. Light mode adds a soft shadow.
- The navigation header, status bar and screen backgrounds use the theme too.

### 7.2 Components (build now, reuse later)
- **ItemCard:** icon tile, name, meta line (buy mode, unit or "by weight"), and the stock number on the right in large tabular digits with a "kg left" caption. Shows "not counted" when there's no count. Tapping it opens the item.
- **QuantityStepper:** a − value + pill on `surfaceRaised`, with 48dp tap targets. The value shows grey when it's a placeholder (the last count). Used by Stock-take.
- **CategoryChips:** a sideways-scrolling pill row, "All" first, with the selected chip filled `primary`.
- **FrequencyToggle:** a segmented "Monthly | As needed" control in the item form.
- **PrimaryButton:** full width, 56dp tall, `primary` fill. The outlined variant is used for Stock-take next to "+ Add item".
- **Screen:** the background plus 16dp side padding.

### 7.3 Categories
- Built-in list, in this order: **Pantry, Fridge, Freezer, Meat, Fruit & veg, Cleaning, Toiletries, Other**, each with an icon. Meat must exist: spec 4.2 totals kg for the Meat category.
- The owner's own categories go in a new PowerSync table `categories (name text, created_at text)`. Their icon is a generic tag. Names are unique ignoring case, and a built-in name can't be added again.
- `items.category` keeps storing the category name as text. That's no schema change to `items`.
- The item form replaces the free-text category field with CategoryChips plus "+ New category", which asks for a name and selects it. New items default to Other.
- Existing items (test data only, owner confirmed) whose category isn't in the list are shown and edited as **Other**. No data conversion.
- Not in scope: renaming or removing your own categories.

### 7.4 Screens
- **Stock** (today's `index.tsx`, header title "Stock"):
  - Sub-line: item count and the last stock-take date.
  - Search box, CategoryChips, then ItemCards grouped under category headings.
  - "Show archived" stays.
  - At the bottom: outlined "Stock-take" and primary "+ Add item".
- **Stock-take:**
  - CategoryChips filter which rows show.
  - ItemCards with QuantityStepper. Typing a number is still possible.
  - The kg | packs toggle is unchanged.
  - The Save button reads "Save stock-take (N)", where N is the number of touched rows.
  - Saving still saves touched rows from all categories, not just the visible ones.
- **Item add/edit:** themed inputs, FrequencyToggle, category chips, and themed Save, Stock & history and Archive buttons.
- **Stock & history:** the big current level, the amount field with Add / Remove, and history rows as cards.

## 8. Acceptance

- DESIGN_SPEC section 8 checklist, every box, on all four screens, except the manual theme override (deferred).
- The phase 1 and phase 2 behaviours still pass: 28 tests, plus a repeat of the phase 2 phone checks.
- Owner phone checks: dark and light (switched in Android settings while the app is open), category chips filtering, adding a custom category from the item form, and both Stock-take and Stock & history restyled.

## 9. Calls made after the builder check (Claude's calls, not the owner's)

1. Chip and heading order: built-ins in the list order, then the owner's own categories (alphabetical), then **Other** last. Chips show every category, even ones with no items yet.
2. Old typed categories are matched to built-in names ignoring capitals, so "meat" counts as Meat (spec 4.2). Anything else shows as Other.
3. The "last stock-take" date on Stock is the newest `stock_counts` row with `source = 'stocktake'`.
4. N in "Save stock-take (N)" counts rows with a number in them, the same rows `buildStockTake` saves. Switching kg/packs alone doesn't count.
5. Light-mode cards are fully solid (`surface` at 100%), so the Android shadow can't show through. Dark mode keeps 92% with no shadow. Check this on the phone.

## 10. Left to the builder

- The icon chosen for each category, from `@expo/vector-icons`.
- Exact spacing within the scale, and font weights.
- How chips scroll and how the selected chip is kept in view.
- Small layout choices inside the cards, as long as numbers stay largest and highest-contrast.
