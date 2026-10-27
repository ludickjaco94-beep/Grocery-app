import { useQuery } from '@powersync/react-native';
import { router, Stack, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { DayStepper } from '@/components/DayStepper';
import { Field } from '@/components/Field';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StorePicker } from '@/components/StorePicker';
import { parseDecimal } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { completeTrip, LAST_PRICE_SQL } from '@/list/listRepo';
import { prefillPrice, validateTrip } from '@/list/listRules';
import { purchaseDate } from '@/purchases/purchaseRules';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type Ticked = { id: string; item_id: string; quantity: number; name: string; unit: string; sold_by_weight: number };

// Latest non-special unit price per item at one shop.
const STORE_PRICE_SQL = `SELECT p.item_id, p.total_price_cents * 1.0 / p.quantity AS unit_cents FROM purchases p
  WHERE p.store_id = ? AND p.is_special = 0 AND p.date = (
    SELECT MAX(date) FROM purchases WHERE item_id = p.item_id AND store_id = p.store_id AND is_special = 0)`;

export default function CompleteTripScreen() {
  const t = useTheme();
  const [now] = useState(() => new Date());
  const [day, setDay] = useState(() => now.toISOString());
  const [pickedStore, setPickedStore] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  // Only what the owner typed; everything else is prefilled live, so a new shop or quantity re-prices untouched rows.
  const [typed, setTyped] = useState<Record<string, { quantity?: string; price?: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));

  const lastStore = useQuery<{ store_id: string }>('SELECT store_id FROM purchases ORDER BY date DESC LIMIT 1').data[0]?.store_id;
  const storeId = pickedStore ?? lastStore ?? null;
  const entries = useQuery<Ticked>(
    `SELECT e.id, e.item_id, e.quantity, i.name, i.unit, i.sold_by_weight FROM list_entries e
     JOIN items i ON i.id = e.item_id WHERE e.ticked = 1 ORDER BY i.name COLLATE NOCASE`
  ).data;
  const lastPrice = new Map(useQuery<{ item_id: string; unit_cents: number | null }>(LAST_PRICE_SQL).data.map((p) => [p.item_id, p.unit_cents]));
  const storePrice = new Map(
    useQuery<{ item_id: string; unit_cents: number }>(STORE_PRICE_SQL, [storeId ?? '']).data.map((p) => [p.item_id, p.unit_cents])
  );

  const rows = entries.map((e) => {
    const quantity = typed[e.id]?.quantity ?? String(e.quantity);
    const q = parseDecimal(quantity);
    const unitCents = storePrice.get(e.item_id) ?? lastPrice.get(e.item_id) ?? null;
    const price = typed[e.id]?.price ?? (typeof q === 'number' && q > 0 ? prefillPrice(unitCents, q) : '');
    return { entry: e, quantity, price };
  });

  usePreventRemove(Object.keys(typed).length > 0 && !done, ({ repeat }) =>
    Alert.alert('Discard this trip?', undefined, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ])
  );
  useEffect(() => {
    if (done) router.back();
  }, [done]);

  const type = (id: string, key: 'quantity' | 'price', value: string) => {
    setTyped((all) => ({ ...all, [id]: { ...all[id], [key]: value } }));
    setErrors(({ [id]: _, ...rest }) => rest);
  };

  function onSave() {
    if (!storeId) return setStoreError('Pick a shop first');
    const result = validateTrip(
      rows.map((r) => ({ entryId: r.entry.id, quantity: r.quantity, price: r.price, soldByWeight: r.entry.sold_by_weight === 1 }))
    );
    if (!result.ok) return setErrors(result.errors);
    const itemOf = new Map(entries.map((e) => [e.id, e.item_id]));
    return guard.run(async () => {
      await completeTrip(
        storeId,
        purchaseDate(day, new Date()),
        result.values.map((v) => ({ ...v, item_id: itemOf.get(v.entryId) as string }))
      );
      setDone(true);
    });
  }

  const section = (title: string) => (
    <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textSecondary, paddingTop: 16, paddingBottom: 8 }}>{title}</Text>
  );

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Complete trip' }} />
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

      {section('Bought')}
      {rows.length ? null : <Text style={{ color: t.textSecondary }}>Nothing ticked on the list.</Text>}
      {rows.map((r) => (
        <View
          key={r.entry.id}
          style={{
            backgroundColor: t.card,
            borderColor: errors[r.entry.id] ? t.danger : t.border,
            borderWidth: 1,
            borderRadius: radius.card,
            padding: 12,
            paddingBottom: 0,
            marginBottom: 10,
            boxShadow: t.cardShadow,
          }}
        >
          <Text style={{ fontSize: font.body, fontWeight: '600', color: t.textPrimary, marginBottom: 8 }}>{r.entry.name}</Text>
          <Field label={`Quantity (${r.entry.unit})`} value={r.quantity} onChangeText={(v) => type(r.entry.id, 'quantity', v)} decimal />
          <Field
            label="Total paid"
            value={r.price}
            onChangeText={(v) => type(r.entry.id, 'price', v)}
            decimal
            placeholder="no price yet"
            error={errors[r.entry.id]}
          />
        </View>
      ))}

      <View style={{ flexDirection: 'row', paddingTop: 8, paddingBottom: 16 }}>
        <PrimaryButton label={`Save ${rows.length} purchases`} onPress={onSave} disabled={!rows.length} />
      </View>
    </ScrollView>
  );
}
