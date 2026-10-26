# Grocery Tracker: Design Spec (hand to Claude Code)

## 0. How to use this file
- Reference images `ref-leafora.png` and `ref-food-app.png` sit next to this file. Use them for **mood only** (dark, rounded, calm green, soft depth). Do NOT copy their layouts: they are shop-front apps, this is a utility app.
- Platform: Android (framework to be chosen in the build plan). Tokens below are framework-neutral; map them to the chosen theme system (e.g. Material theme / Compose / React Native theme file). Define them ONCE in a single theme file and never hard-code colours in screens.
- Priority order when rules conflict: **readability > speed on mid-range Android > looks**.

## 1. Design principles
1. Numbers first. Prices, quantities and totals are the biggest, highest-contrast text on every screen.
2. Calm, not flashy. Dark green surfaces, one bright accent, lots of spacing.
3. No real blur / backdrop-filter. Fake the "glass" look with a solid semi-opaque fill plus a 1px border (see Surfaces). Blur is slow on mid-range Android and lowers text contrast.
4. No photo dependence. Items have no product photos. Use a simple category icon in a rounded tile instead.
5. One-handed use: primary actions sit in the bottom third of the screen.
6. Minimum touch target 48x48dp. Minimum body text 14sp, prices 16sp+ semi-bold.

## 2. Colour tokens

| Token | Dark mode | Light mode | Use |
|---|---|---|---|
| bg | #0F1A14 | #F4F7F3 | Screen background |
| surface | #17251D | #FFFFFF | Cards |
| surfaceRaised | #1F3126 | #EAF1EB | Chips, inputs, steppers |
| border | #2C4535 | #D3E0D5 | 1px card borders |
| textPrimary | #EEF5EF | #12201A | Titles, prices, numbers |
| textSecondary | #A9BDB0 | #4A5F52 | Labels, meta text (must stay readable: contrast >= 4.5:1) |
| primary | #7FB685 | #2F7A47 | Main buttons, selected chips, savings highlights |
| onPrimary | #0F1A14 | #FFFFFF | Text on primary |
| accent | #F59E2B | #D9780B | Single call-to-action pop (e.g. "Scan slip" button), "Special" tag |
| positive | #7FB685 | #2F7A47 | Savings, under budget |
| warning | #F2C14E | #B27A00 | Running low |
| danger | #E5655E | #C0392B | Out of stock, delete |

Rules: only ONE accent-coloured element per screen. Respect system dark/light setting by default; add a manual override (System / Dark / Light) in Settings.

## 3. Shape, spacing, type
- Corner radius: cards 20dp, chips 999dp (pill), buttons 16dp, bottom bar 24dp.
- Spacing scale: 4, 8, 12, 16, 24, 32. Screen side padding 16dp.
- Elevation: none in dark mode (use border). In light mode a very soft shadow (blur 8, 6% black).
- Type: one sans-serif family (system default is fine). Sizes: Title 24 / Section 18 / Body 14-16 / Caption 12. Prices and totals semi-bold. Use tabular (monospaced) digits for prices so columns line up.

## 4. Surfaces ("glass without the blur")
Card = `surface` at 92% opacity + 1px `border` + radius 20dp. Selected card = border switches to `primary`. That is all.

## 5. Core components (build these first, reuse everywhere)
1. **ItemCard**: category icon tile (left), item name (rename on long-press), unit + "Buy monthly / As needed" tag, stock count with stepper, last price in textPrimary.
2. **QuantityStepper**: [-] 3 [+] in a pill on `surfaceRaised`. Used for stock add/remove.
3. **CategoryChips**: horizontally scrolling pill row (All, Pantry, Fridge, Cleaning, Toiletries...). Selected = `primary` fill.
4. **FrequencyToggle**: segmented control "Monthly | As needed".
5. **SpecialToggle**: switch labelled "Special price". When on, show an accent "Special" tag and EXCLUDE that price from normal-price averages.
6. **TotalBar**: sticky bottom card with Subtotal / Fuel + toll / Total. Total in `primary`, 24sp semi-bold.
7. **PrimaryButton**: full width, 56dp tall, `primary` fill. **AccentButton**: used once per screen.
8. **BottomNav**: 4 tabs inside a rounded floating bar: Stock, List, Scan, Prices. Active tab has a `primary` pill behind the icon.

## 6. Screens (first pass)
1. **Stock**: search bar, category chips, list of ItemCards, floating "+ Add item".
2. **Shopping list**: auto-generated "buy this month" list grouped by category, tick-off checkboxes, TotalBar at bottom.
3. **Scan slip**: camera view, AccentButton "Scan slip", fallback "Enter manually". After scan: editable review list (name, qty, price, shop, date, special toggle) then confirm.
4. **Item detail**: price history (date, price, where bought, special flagged), monthly usage, FrequencyToggle, rename, delete.
5. **Prices / Trip check**: city vs local comparison with fuel and toll costs, shown as one big savings number.

## 7. Example: Shopping list screen (what "done" looks like)

```
[ Status bar ]
Shopping list                     (Title 24, textPrimary)
October trip - 14 items           (Caption, textSecondary)

( All ) ( Pantry ) ( Fridge ) ( Cleaning ) ->     <- CategoryChips, "All" selected

+------------------------------------------------+
| [icon]  Rice 10kg                  [-] 2 [+]   |  <- ItemCard
|         Monthly            last R189.99        |
+------------------------------------------------+
+------------------------------------------------+
| [icon]  Cooking oil 2L   (Special)  [-] 3 [+]  |
|         Monthly            last R64.99         |
+------------------------------------------------+
+------------------------------------------------+
| [icon]  Washing powder      [-] 1 [+]          |
|         As needed          last R119.00        |
+------------------------------------------------+

+------------------------------------------------+  <- TotalBar (sticky)
| Subtotal                          R2 140.50    |
| Fuel + toll                         R480.00    |
| Total                       R2 620.50 (green)  |
+------------------------------------------------+
( Stock )  ( List* )  ( Scan )  ( Prices )          <- BottomNav, List active
```

Example theme file the build should produce (adapt syntax to the chosen framework):

```
theme.dark  = { bg:#0F1A14, surface:#17251D, surfaceRaised:#1F3126, border:#2C4535,
                textPrimary:#EEF5EF, textSecondary:#A9BDB0, primary:#7FB685,
                onPrimary:#0F1A14, accent:#F59E2B }
theme.light = { bg:#F4F7F3, surface:#FFFFFF, surfaceRaised:#EAF1EB, border:#D3E0D5,
                textPrimary:#12201A, textSecondary:#4A5F52, primary:#2F7A47,
                onPrimary:#FFFFFF, accent:#D9780B }
radius = { card:20, button:16, chip:999, bar:24 }
spacing = [4, 8, 12, 16, 24, 32]
```

## 8. Acceptance checklist (check before calling any screen finished)
- [ ] Every colour comes from the theme file, none hard-coded.
- [ ] Dark and light both render correctly; switching needs no restart.
- [ ] Text contrast >= 4.5:1 in both modes, including secondary text.
- [ ] No blur effects anywhere; scrolling stays smooth on a mid-range Android phone.
- [ ] All touch targets >= 48dp; prices use tabular digits.
- [ ] Only one accent-coloured element per screen.
- [ ] Looks like the reference mood (dark green, rounded, calm), but is not a copy of either reference layout.
