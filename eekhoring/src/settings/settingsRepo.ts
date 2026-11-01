import { randomUUID } from 'expo-crypto';
import { Appearance } from 'react-native';

import { db } from '@/db/db';

import type { SettingsValues, ThemeMode } from './settingsRules';

export const SETTINGS_SQL = 'SELECT id, currency_symbol, default_buffer_pct, usage_window_months FROM settings LIMIT 1';
export const THEME_SQL = 'SELECT theme_mode FROM device_prefs LIMIT 1';

export async function saveSettings(v: SettingsValues): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{ id: string }>('SELECT id FROM settings LIMIT 1');
    if (row) {
      await tx.execute('UPDATE settings SET currency_symbol = ?, default_buffer_pct = ?, usage_window_months = ? WHERE id = ?', [
        v.currency,
        v.bufferPct,
        v.usageMonths,
        row.id,
      ]);
    } else {
      await tx.execute('INSERT INTO settings (id, currency_symbol, default_buffer_pct, usage_window_months) VALUES (?, ?, ?, ?)', [
        randomUUID(),
        v.currency,
        v.bufferPct,
        v.usageMonths,
      ]);
    }
  });
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{ id: string }>('SELECT id FROM device_prefs LIMIT 1');
    if (row) await tx.execute('UPDATE device_prefs SET theme_mode = ? WHERE id = ?', [mode, row.id]);
    else await tx.execute('INSERT INTO device_prefs (id, theme_mode) VALUES (?, ?)', [randomUUID(), mode]);
  });
  Appearance.setColorScheme(mode);
}

export async function applySavedTheme(): Promise<void> {
  const row = await db.getOptional<{ theme_mode: ThemeMode | null }>(THEME_SQL);
  if (row?.theme_mode) Appearance.setColorScheme(row.theme_mode);
}
