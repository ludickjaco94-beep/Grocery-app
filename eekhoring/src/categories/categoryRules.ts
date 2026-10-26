// Icon names are MaterialCommunityIcons glyphs.
export const BUILT_IN = [
  { name: 'Pantry', icon: 'food-variant' },
  { name: 'Fridge', icon: 'fridge-outline' },
  { name: 'Freezer', icon: 'snowflake' },
  { name: 'Meat', icon: 'food-steak' },
  { name: 'Fruit & veg', icon: 'food-apple-outline' },
  { name: 'Cleaning', icon: 'spray-bottle' },
  { name: 'Toiletries', icon: 'toothbrush-paste' },
  { name: 'Other', icon: 'shape-outline' },
];
export const CUSTOM_ICON = 'tag-outline';

const key = (s: string) => s.trim().toLowerCase();

export function orderedCategories(custom: string[]): { name: string; icon: string }[] {
  const mine = [...custom]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => ({ name, icon: CUSTOM_ICON }));
  return [...BUILT_IN.slice(0, -1), ...mine, BUILT_IN[BUILT_IN.length - 1]];
}

// Phase 1 categories were free text, so "meat" must still count as Meat; anything unknown is Other.
export function resolveCategory(raw: string, custom: string[]): string {
  return orderedCategories(custom).find((c) => key(c.name) === key(raw))?.name ?? 'Other';
}

export function validateNewCategory(raw: string, custom: string[]): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (!name) return { ok: false, error: 'Give the category a name' };
  const clash = orderedCategories(custom).find((c) => key(c.name) === key(name));
  return clash ? { ok: false, error: `${clash.name} already exists` } : { ok: true, name };
}

export function groupByCategory<T extends { category: string }>(
  rows: T[],
  custom: string[],
  only: string | null
): { title: string; icon: string; data: T[] }[] {
  return orderedCategories(custom)
    .filter((c) => only === null || c.name === only)
    .map((c) => ({ title: c.name, icon: c.icon, data: rows.filter((r) => resolveCategory(r.category, custom) === c.name) }))
    .filter((s) => s.data.length > 0);
}
