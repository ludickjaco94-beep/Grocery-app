import { useQuery } from '@powersync/react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { createItem, setItemActive, updateItem } from '@/items/itemRepo';
import {
  emptyItemForm,
  findDuplicate,
  itemToForm,
  UNITS,
  validateItem,
  type BuyMode,
  type ItemForm,
  type ItemValues,
} from '@/items/itemRules';
import { createGuard } from '@/lib/guard';

type ItemRow = ItemValues & { id: string; active: number };

export default function ItemEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const existing = useQuery<ItemRow>('SELECT * FROM items WHERE id = ?', [id]);
  const settings = useQuery<{ default_buffer_pct: number | null }>('SELECT default_buffer_pct FROM settings LIMIT 1');

  // Wait for the item (or the default buffer for a new item) before building the form.
  if (isNew ? settings.isLoading : existing.isLoading) return <Text style={styles.loading}>Loading…</Text>;
  const item = existing.data[0];
  if (!isNew && !item) return <Text style={styles.loading}>Item not found.</Text>;

  const initial = isNew
    ? { ...emptyItemForm, bufferPct: String(settings.data[0]?.default_buffer_pct ?? 10) }
    : itemToForm(item);
  return <ItemEditForm id={id} item={isNew ? undefined : item} initial={initial} />;
}

function ItemEditForm({ id, item, initial }: { id: string; item?: ItemRow; initial: ItemForm }) {
  const isNew = !item;
  const names = useQuery<{ id: string; name: string }>('SELECT id, name FROM items WHERE active = 1');
  const categories = useQuery<{ category: string }>('SELECT DISTINCT category FROM items ORDER BY category COLLATE NOCASE');
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ItemForm, string>>>({});

  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', String(e))));

  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => setForm({ ...form, [key]: value });

  const save = (values: ItemValues) =>
    guard.run(async () => {
      if (isNew) await createItem(values);
      else await updateItem(id, values);
      router.back();
    });

  function onSave() {
    const result = validateItem(form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    const dup = findDuplicate(result.values.name, names.data, isNew ? undefined : id);
    if (!dup) return save(result.values);
    Alert.alert('Duplicate name', `You already have ${dup.name}. Save anyway?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: () => save(result.values) },
    ]);
  }

  const onToggleArchive = () =>
    guard.run(async () => {
      await setItemActive(id, !item!.active);
      router.back();
    });

  const field = (key: keyof ItemForm, label: string, decimal = false, hint?: string) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={form[key] as string}
        onChangeText={(t) => set(key, t)}
        keyboardType={decimal ? 'decimal-pad' : 'default'}
        accessibilityLabel={label}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {errors[key] ? <Text style={styles.error}>{errors[key]}</Text> : null}
    </View>
  );

  const choice = <T extends string>(options: { value: T; label: string }[], value: T, onPick: (v: T) => void) => (
    <View style={styles.choices}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onPick(o.value)}
          style={[styles.choice, value === o.value && styles.choiceOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.value }}
        >
          <Text style={value === o.value ? styles.choiceOnText : undefined}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Add item' : 'Edit item' }} />
      {field('name', 'Name')}

      <View style={styles.switchRow}>
        <Text style={styles.label}>Sold by weight (kg)</Text>
        <Switch value={form.soldByWeight} onValueChange={(v) => set('soldByWeight', v)} accessibilityLabel="Sold by weight" />
      </View>

      {form.soldByWeight ? (
        <Text style={styles.hint}>Unit: kg. Prices show per kg.</Text>
      ) : (
        <View style={styles.field}>
          <Text style={styles.label}>Unit</Text>
          {choice(UNITS.map((u) => ({ value: u, label: u })), form.unit, (u) => set('unit', u))}
        </View>
      )}

      {field('category', 'Category')}
      <View style={styles.choices}>
        {categories.data
          .filter((c) => c.category !== form.category)
          .map((c) => (
            <Pressable key={c.category} onPress={() => set('category', c.category)} style={styles.chip}>
              <Text>{c.category}</Text>
            </Pressable>
          ))}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Buy</Text>
        {choice<BuyMode>(
          [
            { value: 'monthly', label: 'Monthly' },
            { value: 'as_needed', label: 'As needed' },
          ],
          form.buyMode,
          (m) => set('buyMode', m)
        )}
      </View>

      {field('bufferPct', 'Buffer %', true, 'Extra on top of average use')}
      {field('maxMonthsCover', 'Cap (months of stock)', true, 'Never suggest more than this')}
      {field('estMonthlyUsage', `Monthly estimate (${form.soldByWeight ? 'kg' : form.unit})`, true, 'Used until two stock-takes exist')}
      {form.soldByWeight ? null : field('packSize', 'Pack size (optional)', true)}

      <Pressable style={styles.save} onPress={onSave} accessibilityRole="button">
        <Text style={styles.saveText}>Save</Text>
      </Pressable>
      {!isNew && item ? (
        <Pressable style={styles.archive} onPress={onToggleArchive} accessibilityRole="button">
          <Text>{item.active ? 'Archive' : 'Restore'}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, backgroundColor: '#fff' },
  loading: { padding: 16 },
  field: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  hint: { fontSize: 12, color: '#777', marginTop: 2, marginBottom: 8 },
  error: { fontSize: 13, color: '#c62828', marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  choice: { minHeight: 44, minWidth: 56, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  choiceOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  choiceOnText: { color: '#fff', fontWeight: '700' },
  chip: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 18, backgroundColor: '#eee' },
  save: { backgroundColor: '#2e7d32', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  archive: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 12 },
});
