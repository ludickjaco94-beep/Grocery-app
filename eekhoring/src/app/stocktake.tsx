import { useQuery } from '@powersync/react-native';
import { router, Stack, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert, SectionList, Text, View } from 'react-native';

import { CUSTOM_CATEGORIES_SQL } from '@/categories/categoryRepo';
import { groupByCategory, orderedCategories } from '@/categories/categoryRules';
import { CategoryChips, Chip } from '@/components/CategoryChips';
import { ItemCard } from '@/components/ItemCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Screen } from '@/components/Screen';
import { type Unit } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { CURRENT_STOCK_SQL, KG_PER_PACK_SQL, saveStockTake } from '@/stock/stockRepo';
import { buildStockTake, bumpCount, NO_PACK_DATA, stepFor, usageWindowStart } from '@/stock/stockRules';
import { font } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type ItemRow = { id: string; name: string; unit: Unit; category: string; sold_by_weight: number; quantity: number | null };
type Entry = { text: string; packs: boolean };

export default function StockTakeScreen() {
  const t = useTheme();
  const [now] = useState(() => new Date());
  const items = useQuery<ItemRow>(
    `SELECT items.id, items.name, items.unit, items.category, items.sold_by_weight, cs.quantity FROM items
     LEFT JOIN (${CURRENT_STOCK_SQL}) cs ON cs.item_id = items.id
     WHERE items.active = 1 ORDER BY items.name COLLATE NOCASE`
  );
  const settings = useQuery<{ usage_window_months: number | null }>('SELECT usage_window_months FROM settings LIMIT 1');
  const months = settings.data[0]?.usage_window_months ?? 3;
  const packs = useQuery<{ item_id: string; kg_per_pack: number }>(KG_PER_PACK_SQL, [usageWindowStart(now, months)]);
  const custom = useQuery<{ name: string }>(CUSTOM_CATEGORIES_SQL);

  // Build the rows once everything has loaded, so the starting counts are the real last counts.
  if (items.isLoading || settings.isLoading || packs.isLoading || custom.isLoading)
    return <Text style={{ padding: 16, color: t.textSecondary, backgroundColor: t.bg, flex: 1 }}>Loading…</Text>;
  const kgPerPack = new Map(packs.data.map((p) => [p.item_id, p.kg_per_pack]));
  return <StockTakeForm items={items.data} kgPerPack={kgPerPack} custom={custom.data.map((c) => c.name)} />;
}

function StockTakeForm({ items, kgPerPack, custom }: { items: ItemRow[]; kgPerPack: Map<string, number>; custom: string[] }) {
  const t = useTheme();
  // Rows start blank (last count shown greyed): only rows the owner actually touches are saved.
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', String(e))));

  const entry = (id: string) => entries[id] ?? { text: '', packs: false };
  const set = (id: string, e: Entry) => setEntries((all) => ({ ...all, [id]: e }));
  const dirty = Object.values(entries).some((e) => e.text !== '' || e.packs);
  const counted = Object.values(entries).filter((e) => e.text.trim() !== '').length;

  usePreventRemove(dirty && !saved, ({ repeat }) =>
    Alert.alert('Discard this stock-take?', undefined, [
      { text: 'Keep counting', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ])
  );

  function bump(item: ItemRow, sign: 1 | -1) {
    const e = entry(item.id);
    // The last count is in kg, so it is no starting point for a packs count.
    set(item.id, { ...e, text: bumpCount(e.text, e.packs ? null : item.quantity, e.packs ? 1 : stepFor(item.unit), sign) });
  }

  // Saves every touched row, including ones hidden by the category filter.
  const onSave = () =>
    guard.run(async () => {
      const result = buildStockTake(
        items.map((i) => ({ itemId: i.id, ...entry(i.id), kgPerPack: kgPerPack.get(i.id) ?? null }))
      );
      if (!result.ok) {
        setErrors(result.errors);
        setSelected(null);
        Alert.alert('Fix the rows marked red');
        return;
      }
      setErrors({});
      await saveStockTake(result.entries);
      setSaved(true);
      const { entries: counts, skipped } = result;
      Alert.alert('Saved', `${counts.length} counts saved${skipped ? `, ${skipped} not counted` : ''}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Stock-take' }} />
      <Text style={{ fontSize: font.caption, color: t.textSecondary, marginBottom: 8 }}>
        Grey = last count. Untouched rows are skipped.
      </Text>
      <CategoryChips categories={orderedCategories(custom)} selected={selected} onSelect={setSelected} />
      <SectionList
        sections={groupByCategory(items, custom, selected)}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textSecondary, paddingTop: 12, paddingBottom: 8 }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, section }) => {
          const e = entry(item.id);
          const hasPacks = kgPerPack.has(item.id);
          return (
            <View>
              <ItemCard
                name={item.name}
                icon={section.icon}
                meta={e.packs ? 'packs' : item.unit}
                right={
                  <QuantityStepper
                    value={e.text}
                    placeholder={e.packs || item.quantity === null ? '' : String(item.quantity)}
                    onMinus={() => bump(item, -1)}
                    onPlus={() => bump(item, 1)}
                    onChangeText={(text) => set(item.id, { ...e, text })}
                    label={item.name}
                    invalid={!!errors[item.id]}
                  />
                }
              >
                {item.sold_by_weight ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <Chip label="kg" on={!e.packs} onPress={() => e.packs && set(item.id, { text: '', packs: false })} />
                    {hasPacks ? (
                      // A number means something else in the other mode, so switching clears it.
                      <Chip label="packs" on={e.packs} onPress={() => !e.packs && set(item.id, { text: '', packs: true })} />
                    ) : (
                      <Text style={{ flex: 1, fontSize: font.caption, color: t.textSecondary }}>{NO_PACK_DATA}</Text>
                    )}
                  </View>
                ) : null}
              </ItemCard>
              {errors[item.id] ? (
                <Text style={{ color: t.danger, fontSize: font.caption, marginTop: -4, marginBottom: 8 }}>{errors[item.id]}</Text>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: t.textSecondary, marginTop: 32 }}>No items yet. Add items first.</Text>}
      />
      <View style={{ flexDirection: 'row', paddingTop: 8, paddingBottom: 16 }}>
        <PrimaryButton label={`Save stock-take (${counted})`} onPress={onSave} />
      </View>
    </Screen>
  );
}
