import { useQuery } from '@powersync/react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Chip } from '@/components/CategoryChips';
import { Field, SwitchRow } from '@/components/Field';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { findDuplicate } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { saveSettings, saveThemeMode, SETTINGS_SQL, THEME_SQL } from '@/settings/settingsRepo';
import { validateSettings, type SettingsForm, type ThemeMode } from '@/settings/settingsRules';
import { addStore, STORES_SQL, updateStore } from '@/stores/storeRepo';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type SettingsRow = { id: string; currency_symbol: string | null; default_buffer_pct: number | null; usage_window_months: number | null };
type Store = { id: string; name: string; is_city: number };
type ShopDraft = { id: string | null; name: string; isCity: boolean; error?: string };

const THEMES: { mode: ThemeMode; label: string }[] = [
  { mode: 'auto', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

function useGuard() {
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));
  return guard;
}

function Heading({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: font.section, fontWeight: '700', color: t.textPrimary, marginTop: 24, marginBottom: 12 }}>{text}</Text>;
}

function GeneralSection({ row }: { row: SettingsRow | undefined }) {
  const t = useTheme();
  const guard = useGuard();
  const [form, setForm] = useState<SettingsForm>({
    currency: row?.currency_symbol ?? 'R',
    bufferPct: String(row?.default_buffer_pct ?? 10),
    usageMonths: String(row?.usage_window_months ?? 3),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsForm, string>>>({});
  const [saved, setSaved] = useState(false);

  function change(patch: Partial<SettingsForm>) {
    setForm({ ...form, ...patch });
    setSaved(false);
  }

  function onSave() {
    const result = validateSettings(form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    return guard.run(async () => {
      await saveSettings(result.values);
      setSaved(true);
    });
  }

  return (
    <>
      <Field label="Currency" value={form.currency} onChangeText={(currency) => change({ currency })} error={errors.currency} />
      <Field
        label="Default buffer (%)"
        decimal
        value={form.bufferPct}
        onChangeText={(bufferPct) => change({ bufferPct })}
        error={errors.bufferPct}
        hint="Used for new items and groups."
      />
      <Field
        label="Usage window (months)"
        decimal
        value={form.usageMonths}
        onChangeText={(usageMonths) => change({ usageMonths })}
        error={errors.usageMonths}
      />
      <View style={{ flexDirection: 'row' }}>
        <PrimaryButton label="Save" onPress={onSave} />
      </View>
      {saved ? <Text style={{ fontSize: font.small, color: t.textSecondary, marginTop: 8 }}>Saved.</Text> : null}
    </>
  );
}

function ShopsSection() {
  const t = useTheme();
  const guard = useGuard();
  const stores = useQuery<Store>(STORES_SQL).data;
  const [draft, setDraft] = useState<ShopDraft | null>(null);

  function onSave() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setDraft({ ...draft, error: 'Give the shop a name' });
    const dup = findDuplicate(name, stores, draft.id ?? undefined);
    if (dup) return setDraft({ ...draft, error: `You already have ${dup.name}` });
    return guard.run(async () => {
      if (draft.id) await updateStore(draft.id, name, draft.isCity);
      else await addStore(name, draft.isCity);
      setDraft(null);
    });
  }

  const form = draft ? (
    <View style={{ marginBottom: 12 }}>
      <Field label="Shop name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name, error: undefined })} error={draft.error} />
      <SwitchRow label="City shop" value={draft.isCity} onValueChange={(isCity) => setDraft({ ...draft, isCity })} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <PrimaryButton label="Cancel" variant="outline" onPress={() => setDraft(null)} />
        <PrimaryButton label="Save shop" onPress={onSave} />
      </View>
    </View>
  ) : null;

  return (
    <>
      {stores.length === 0 && !draft ? <Text style={{ color: t.textSecondary, marginBottom: 12 }}>No shops yet.</Text> : null}
      {stores.map((s) =>
        draft?.id === s.id ? (
          <View key={s.id}>{form}</View>
        ) : (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${s.name}`}
            onPress={() => setDraft({ id: s.id, name: s.name, isCity: s.is_city === 1 })}
            style={{
              minHeight: 48,
              paddingHorizontal: 14,
              marginBottom: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderRadius: radius.button,
              backgroundColor: t.surfaceRaised,
            }}
          >
            <Text style={{ flex: 1, fontSize: font.body, color: t.textPrimary }}>{s.name}</Text>
            <Text style={{ fontSize: font.small, color: t.textSecondary }}>{s.is_city === 1 ? 'City' : 'Local'}</Text>
          </Pressable>
        )
      )}
      {draft && !draft.id ? form : null}
      {!draft ? (
        <View style={{ flexDirection: 'row' }}>
          <PrimaryButton label="+ New shop" variant="outline" onPress={() => setDraft({ id: null, name: '', isCity: true })} />
        </View>
      ) : null}
    </>
  );
}

export default function SettingsScreen() {
  const guard = useGuard();
  const settings = useQuery<SettingsRow>(SETTINGS_SQL);
  const theme = useQuery<{ theme_mode: ThemeMode | null }>(THEME_SQL).data[0]?.theme_mode ?? 'auto';

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <Heading text="General" />
        {/* Keyed by row id: a restore swaps the row, and the form must show the restored values. */}
        {settings.isLoading ? null : <GeneralSection key={settings.data[0]?.id ?? 'none'} row={settings.data[0]} />}
        <Heading text="Theme" />
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {THEMES.map(({ mode, label }) => (
            <Chip key={mode} label={label} on={theme === mode} onPress={() => guard.run(() => saveThemeMode(mode))} />
          ))}
        </View>
        <Heading text="Shops" />
        <ShopsSection />
      </ScrollView>
    </Screen>
  );
}
