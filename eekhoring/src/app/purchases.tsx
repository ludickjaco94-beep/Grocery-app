import { useQuery } from '@powersync/react-native';
import { Link, Stack, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CUSTOM_CATEGORIES_SQL } from '@/categories/categoryRepo';
import { orderedCategories, resolveCategory } from '@/categories/categoryRules';
import { Chip } from '@/components/CategoryChips';
import { DayStepper } from '@/components/DayStepper';
import { ItemCard } from '@/components/ItemCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StorePicker } from '@/components/StorePicker';
import { createGuard } from '@/lib/guard';
import { PurchaseForm } from '@/purchases/PurchaseForm';
import { addPurchase } from '@/purchases/purchaseRepo';
import { dayRange, emptyPurchaseForm, purchaseDate, formatMoney, unitPriceCents, validatePurchase, type PurchaseFormState } from '@/purchases/purchaseRules';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type Item = { id: string; name: string; unit: string; category: string; sold_by_weight: number };
type Logged = { id: string; quantity: number; total_price_cents: number; is_special: number; is_emergency: number; name: string; unit: string; category: string };

export default function PurchasesScreen() {
  const t = useTheme();
  const [now] = useState(() => new Date());
  const [day, setDay] = useState(() => now.toISOString());
  const [pickedStore, setPickedStore] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [item, setItem] = useState<Item | null>(null);
  const [form, setForm] = useState<PurchaseFormState>(emptyPurchaseForm);
  const [errors, setErrors] = useState<Partial<Record<keyof PurchaseFormState, string>>>({});
  const [storeError, setStoreError] = useState<string | null>(null);
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));

  const lastStore = useQuery<{ store_id: string }>('SELECT store_id FROM purchases ORDER BY date DESC LIMIT 1').data[0]?.store_id;
  const storeId = pickedStore ?? lastStore ?? null;
  const symbol = useQuery<{ currency_symbol: string | null }>('SELECT currency_symbol FROM settings LIMIT 1').data[0]?.currency_symbol ?? 'R';
  const custom = useQuery<{ name: string }>(CUSTOM_CATEGORIES_SQL).data.map((c) => c.name);
  const matches = useQuery<Item>(
    'SELECT id, name, unit, category, sold_by_weight FROM items WHERE active = 1 AND name LIKE ? ORDER BY name COLLATE NOCASE LIMIT 5',
    [`%${search.trim()}%`]
  ).data;
  const [from, to] = dayRange(day);
  const logged = useQuery<Logged>(
    `SELECT p.id, p.quantity, p.total_price_cents, p.is_special, p.is_emergency, i.name, i.unit, i.category
     FROM purchases p JOIN items i ON i.id = p.item_id
     WHERE p.store_id = ? AND p.date >= ? AND p.date < ? ORDER BY p.date DESC`,
    [storeId ?? '', from, to]
  ).data;

  const iconFor = (category: string) =>
    orderedCategories(custom).find((c) => c.name === resolveCategory(category, custom))?.icon ?? 'shape-outline';
  const dirty = item !== null || JSON.stringify(form) !== JSON.stringify(emptyPurchaseForm);

  usePreventRemove(dirty, ({ repeat }) =>
    Alert.alert('Discard this item?', undefined, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ])
  );

  function onAdd() {
    if (!item) return;
    if (!storeId) return setStoreError('Pick a shop first');
    const result = validatePurchase(form, item.sold_by_weight === 1);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    return guard.run(async () => {
      await addPurchase({ ...result.values, item_id: item.id, store_id: storeId, date: purchaseDate(day, new Date()) });
      setItem(null);
      setForm(emptyPurchaseForm);
      setSearch('');
    });
  }

  const section = (title: string) => (
    <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textSecondary, paddingTop: 16, paddingBottom: 8 }}>{title}</Text>
  );
  const total = logged.reduce((sum, p) => sum + p.total_price_cents, 0);

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Log purchases' }} />

      {section('Shop')}
      <StorePicker
        value={storeId}
        onChange={(id) => {
          setPickedStore(id);
          setStoreError(null);
        }}
        error={storeError}
      />
      <View style={{ marginTop: 12 }}>
        <DayStepper value={day} onChange={setDay} now={now} />
      </View>

      {section('Add item')}
      {item ? (
        <>
          <ItemCard
            name={item.name}
            icon={iconFor(item.category)}
            meta={item.sold_by_weight ? (item.unit === 'L' ? 'by volume' : 'by weight') : item.unit}
            right={<Chip label="Change" on={false} onPress={() => { setItem(null); setForm(emptyPurchaseForm); setErrors({}); }} />}
          />
          <PurchaseForm
            form={form}
            onChange={setForm}
            errors={errors}
            soldByWeight={item.sold_by_weight === 1}
            unit={item.unit}
            symbol={symbol}
          />
          <View style={{ flexDirection: 'row' }}>
            <PrimaryButton label="Add to list" onPress={onAdd} />
          </View>
        </>
      ) : (
        <>
          <TextInput
            style={{
              backgroundColor: t.surfaceRaised,
              borderColor: t.border,
              borderWidth: 1,
              borderRadius: radius.button,
              paddingHorizontal: 14,
              minHeight: 48,
              fontSize: font.body,
              color: t.textPrimary,
              marginBottom: 8,
            }}
            value={search}
            onChangeText={setSearch}
            placeholder="Search items"
            placeholderTextColor={t.textSecondary}
            accessibilityLabel="Search items to log"
          />
          {matches.map((m) => (
            <Pressable key={m.id} onPress={() => setItem(m)} accessibilityRole="button">
              <ItemCard name={m.name} icon={iconFor(m.category)} meta={m.sold_by_weight ? (m.unit === 'L' ? 'by volume' : 'by weight') : m.unit} right={null} />
            </Pressable>
          ))}
          {matches.length === 0 ? (
            <Text style={{ color: t.textSecondary, fontSize: font.small }}>No items match. Add the item on the Stock screen first.</Text>
          ) : null}
        </>
      )}

      {section('Logged at this shop')}
      {logged.map((p) => (
        <Link key={p.id} href={`/purchase/${p.id}`} asChild>
          <Pressable accessibilityRole="button">
            <ItemCard
              name={p.name}
              icon={iconFor(p.category)}
              meta={[
                `${p.quantity} ${p.unit}`,
                `${formatMoney(Math.round(unitPriceCents(p.total_price_cents, p.quantity)), symbol)} per ${p.unit}`,
                p.is_special ? 'SPECIAL' : null,
                p.is_emergency ? 'EMERGENCY' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                <Text style={{ fontSize: font.body, fontWeight: '600', color: t.textPrimary, fontVariant: ['tabular-nums'] }}>
                  {formatMoney(p.total_price_cents, symbol)}
                </Text>
              }
            />
          </Pressable>
        </Link>
      ))}
      {logged.length ? (
        <Text style={{ fontSize: font.body, fontWeight: '600', color: t.textPrimary, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
          {logged.length} items · {formatMoney(total, symbol)}
        </Text>
      ) : (
        <Text style={{ color: t.textSecondary, fontSize: font.small }}>Nothing logged at this shop on this day yet.</Text>
      )}
    </ScrollView>
  );
}
