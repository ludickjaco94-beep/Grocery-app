import { parseDecimal } from '@/items/itemRules';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type SettingsForm = { currency: string; bufferPct: string; usageMonths: string };
export type SettingsValues = { currency: string; bufferPct: number; usageMonths: number };

export function validateSettings(
  f: SettingsForm
): { ok: true; values: SettingsValues } | { ok: false; errors: Partial<Record<keyof SettingsForm, string>> } {
  const errors: Partial<Record<keyof SettingsForm, string>> = {};
  const currency = f.currency.trim();
  if (currency.length < 1 || currency.length > 3) errors.currency = 'Currency must be 1 to 3 characters';

  const bufferPct = parseDecimal(f.bufferPct);
  if (typeof bufferPct !== 'number' || !Number.isInteger(bufferPct) || bufferPct < 0 || bufferPct > 100)
    errors.bufferPct = 'Buffer must be a whole number from 0 to 100';

  const usageMonths = parseDecimal(f.usageMonths);
  if (typeof usageMonths !== 'number' || !Number.isInteger(usageMonths) || usageMonths < 1 || usageMonths > 12)
    errors.usageMonths = 'Usage window must be a whole number from 1 to 12';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { currency, bufferPct: bufferPct as number, usageMonths: usageMonths as number } };
}
