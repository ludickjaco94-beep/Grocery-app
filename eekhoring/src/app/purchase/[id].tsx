import { useQuery } from '@powersync/react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { CategoryChips } from '@/components/CategoryChips';
import { DayStepper } from '@/components/DayStepper';
import { PrimaryButton } from '@/components/PrimaryButton';
import { createGuard } from '@/lib/guard';
import { PurchaseForm } from '@/purchases/PurchaseForm';
import { deletePurchase, updatePurchase } from '@/purchases/purchaseRepo';
import { purchaseDate, purchaseToForm, validatePurchase, type PurchaseFormState, type PurchaseValues } from '@/purchases/purchaseRules';
import { STORES_SQL } from '@/stores/storeRepo';
import { font } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type Row = PurchaseValues & { id: string; store_id: string; date: string; name: string; unit: string; sold_by_weight: number };

export default function PurchaseEditScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const purchase = useQuery<Row>(
    `SELECT p.id, p.store_id, p.date, p.quantity, p.total_price_cents, p.is_special, p.regular_price_cents, p.special_note,
            p.is_emergency, p.pack_count, i.name, i.unit, i.sold_by_weight
     FROM purchases p JOIN items i ON i.id = p.item_id WHERE p.id = ?`,
    [id]
  );

  const message = (text: string) => <Text style={{ flex: 1, padding: 16, color: t.textSecondary, backgroundColor: t.bg }}>{text}</Text>;
  if (purchase.isLoading) return message('Loading…');
  if (purchase.error) return message(`Could not load purchase: ${purchase.error.message}`);
  const row = purchase.data[0];
  if (!row) return message('Purchase not found.');
  return <PurchaseEdit row={row} />;
}

function PurchaseEdit({ row }: { row: Row }) {
  const t = useTheme();
  const [now] = useState(() => new Date());
  const [storeId, setStoreId] = useState(row.store_id);
  const [day, setDay] = useState(row.date);
  const [form, setForm] = useState<PurchaseFormState>(() => purchaseToForm(row));
  const [errors, setErrors] = useState<Partial<Record<keyof PurchaseFormState, string>>>({});
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));
  const stores = useQuery<{ id: string; name: string }>(STORES_SQL).data;
  const symbol = useQuery<{ currency_symbol: string | null }>('SELECT currency_symbol FROM settings LIMIT 1').data[0]?.currency_symbol ?? 'R';

  function onSave() {
    const result = validatePurchase(form, row.sold_by_weight === 1);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    return guard.run(async () => {
      await updatePurchase(row.id, { ...result.values, store_id: storeId, date: day === row.date ? row.date : purchaseDate(day, new Date()) });
      router.back();
    });
  }

  const onDelete = () =>
    Alert.alert('Delete this purchase? Stock is corrected.', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          guard.run(async () => {
            await deletePurchase(row.id);
            router.back();
          }),
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Edit purchase' }} />
      <Text style={{ fontSize: font.title, fontWeight: '700', color: t.textPrimary, marginBottom: 12 }}>{row.name}</Text>
      <CategoryChips
        categories={stores}
        selected={stores.find((s) => s.id === storeId)?.name ?? null}
        onSelect={(name) => {
          const s = stores.find((x) => x.name === name);
          if (s) setStoreId(s.id);
        }}
        includeAll={false}
      />
      <View style={{ marginVertical: 12 }}>
        <DayStepper value={day} onChange={setDay} now={now} />
      </View>
      <PurchaseForm form={form} onChange={setForm} errors={errors} soldByWeight={row.sold_by_weight === 1} unit={row.unit} symbol={symbol} />
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        <PrimaryButton label="Save" onPress={onSave} />
      </View>
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <PrimaryButton label="Delete" variant="outline" onPress={onDelete} />
      </View>
    </ScrollView>
  );
}
