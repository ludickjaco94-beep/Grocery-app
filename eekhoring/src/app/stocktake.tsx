import { useQuery } from '@powersync/react-native';
import { router, Stack, usePreventRemove } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseDecimal, type Unit } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { CURRENT_STOCK_SQL, KG_PER_PACK_SQL, saveStockTake } from '@/stock/stockRepo';
import { buildStockTake, NO_PACK_DATA, roundQty, stepFor, usageWindowStart } from '@/stock/stockRules';

type ItemRow = { id: string; name: string; unit: Unit; category: string; sold_by_weight: number; quantity: number | null };
type Entry = { text: string; packs: boolean };

export default function StockTakeScreen() {
  const [now] = useState(() => new Date());
  const items = useQuery<ItemRow>(
    `SELECT items.id, items.name, items.unit, items.category, items.sold_by_weight, cs.quantity FROM items
     LEFT JOIN (${CURRENT_STOCK_SQL}) cs ON cs.item_id = items.id
     WHERE items.active = 1 ORDER BY items.category COLLATE NOCASE, items.name COLLATE NOCASE`
  );
  const settings = useQuery<{ usage_window_months: number | null }>('SELECT usage_window_months FROM settings LIMIT 1');
  const months = settings.data[0]?.usage_window_months ?? 3;
  const packs = useQuery<{ item_id: string; kg_per_pack: number }>(KG_PER_PACK_SQL, [usageWindowStart(now, months)]);

  // Build the rows once everything has loaded, so the starting counts are the real last counts.
  if (items.isLoading || settings.isLoading || packs.isLoading) return <Text style={styles.empty}>Loading…</Text>;
  const kgPerPack = new Map(packs.data.map((p) => [p.item_id, p.kg_per_pack]));
  return <StockTakeForm items={items.data} kgPerPack={kgPerPack} />;
}

function StockTakeForm({ items, kgPerPack }: { items: ItemRow[]; kgPerPack: Map<string, number> }) {
  const [initial] = useState(() =>
    Object.fromEntries(items.map((i) => [i.id, { text: i.quantity === null ? '' : String(i.quantity), packs: false }]))
  );
  const [entries, setEntries] = useState<Record<string, Entry>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', String(e))));

  const entry = (id: string) => entries[id] ?? { text: '', packs: false };
  const set = (id: string, e: Entry) => setEntries((all) => ({ ...all, [id]: e }));
  const dirty = items.some((i) => {
    const a = entry(i.id);
    const b = initial[i.id] ?? { text: '', packs: false };
    return a.text !== b.text || a.packs !== b.packs;
  });

  usePreventRemove(dirty && !saved, ({ repeat }) =>
    Alert.alert('Discard this stock-take?', undefined, [
      { text: 'Keep counting', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ])
  );

  const sections = useMemo(() => {
    const byCategory = new Map<string, ItemRow[]>();
    for (const r of items) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
    return [...byCategory].map(([title, data]) => ({ title, data }));
  }, [items]);

  function bump(item: ItemRow, sign: 1 | -1) {
    const e = entry(item.id);
    const n = parseDecimal(e.text);
    const base = typeof n === 'number' ? n : 0;
    const step = e.packs ? 1 : stepFor(item.unit);
    set(item.id, { ...e, text: String(Math.max(0, roundQty(base + sign * step))) });
  }

  const onSave = () =>
    guard.run(async () => {
      const result = buildStockTake(
        items.map((i) => ({ itemId: i.id, ...entry(i.id), kgPerPack: kgPerPack.get(i.id) ?? null }))
      );
      if (!result.ok) {
        setErrors(result.errors);
        Alert.alert('Fix the rows marked red');
        return;
      }
      setErrors({});
      await saveStockTake(result.entries);
      setSaved(true);
      const { entries: counts, skipped } = result;
      Alert.alert('Saved', `${counts.length} counts saved${skipped ? `, ${skipped} blank skipped` : ''}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Stock-take' }} />
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        renderSectionHeader={({ section }) => <Text style={styles.header}>{section.title}</Text>}
        renderItem={({ item }) => {
          const e = entry(item.id);
          const hasPacks = kgPerPack.has(item.id);
          return (
            <View style={styles.item}>
              <View style={styles.line}>
                <Text style={styles.name}>
                  {item.name} <Text style={styles.meta}>{e.packs ? 'packs' : item.unit}</Text>
                </Text>
                <Pressable style={styles.step} onPress={() => bump(item, -1)} accessibilityLabel={`Less ${item.name}`}>
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <TextInput
                  style={[styles.input, errors[item.id] && styles.inputError]}
                  value={e.text}
                  onChangeText={(text) => set(item.id, { ...e, text })}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Count of ${item.name}`}
                />
                <Pressable style={styles.step} onPress={() => bump(item, 1)} accessibilityLabel={`More ${item.name}`}>
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
              {item.sold_by_weight ? (
                <View style={styles.line}>
                  {(['kg', 'packs'] as const).map((mode) => {
                    const on = e.packs === (mode === 'packs');
                    const disabled = mode === 'packs' && !hasPacks;
                    return (
                      <Pressable
                        key={mode}
                        disabled={disabled}
                        // A number means something else in the other mode, so switching clears it.
                        onPress={() => !on && set(item.id, { text: '', packs: mode === 'packs' })}
                        style={[styles.mode, on && styles.modeOn, disabled && styles.modeDisabled]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled }}
                      >
                        <Text style={on ? styles.modeOnText : undefined}>{mode}</Text>
                      </Pressable>
                    );
                  })}
                  {hasPacks ? null : <Text style={styles.hint}>{NO_PACK_DATA}</Text>}
                </View>
              ) : null}
              {errors[item.id] ? <Text style={styles.error}>{errors[item.id]}</Text> : null}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No items yet. Add items first.</Text>}
      />
      <Pressable style={styles.save} onPress={onSave} accessibilityRole="button">
        <Text style={styles.saveText}>Save stock-take</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#fff' },
  header: { fontWeight: '700', fontSize: 14, color: '#555', paddingTop: 16, paddingBottom: 4, backgroundColor: '#fff' },
  item: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  name: { flex: 1, fontSize: 16 },
  meta: { fontSize: 13, color: '#777' },
  step: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, fontWeight: '700' },
  input: { width: 72, height: 48, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, textAlign: 'center', fontSize: 16 },
  inputError: { borderColor: '#c62828' },
  mode: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#ccc', justifyContent: 'center' },
  modeOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  modeOnText: { color: '#fff' },
  modeDisabled: { opacity: 0.4 },
  hint: { flex: 1, fontSize: 12, color: '#777' },
  error: { color: '#c62828', fontSize: 13 },
  empty: { textAlign: 'center', color: '#777', marginTop: 32 },
  save: { backgroundColor: '#2e7d32', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
