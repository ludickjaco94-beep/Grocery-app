import { useQuery } from '@powersync/react-native';
import { router, Stack, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Chip } from '@/components/CategoryChips';
import { DayStepper } from '@/components/DayStepper';
import { Field } from '@/components/Field';
import { PrimaryButton } from '@/components/PrimaryButton';
import { StorePicker } from '@/components/StorePicker';
import { cheapestOption, groupName, hintCount, holds, type Measurable } from '@/groups/groupRules';
import { parseDecimal } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { completeTrip, LAST_PRICE_SQL } from '@/list/listRepo';
import { prefillPrice, validateTrip } from '@/list/listRules';
import { purchaseDate } from '@/purchases/purchaseRules';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type Ticked = {
  id: string;
  item_id: string | null;
  group_id: string | null;
  quantity: number;
  name: string | null;
  unit: string | null;
  sold_by_weight: number | null;
};
type GroupInfo = { id: string; kind: string; person: string; base_unit: string };
type MemberInfo = Measurable & { group_id: string; id: string; name: string };
type Typed = { itemId?: string; quantity?: string; price?: string };

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
  // Only what the owner typed, keyed by line; everything else is prefilled live, so a new shop or quantity re-prices untouched lines.
  const [typed, setTyped] = useState<Record<string, Typed>>({});
  // Extra lines per group entry ("+ another product"); line 0 always exists.
  const [extra, setExtra] = useState<Record<string, number[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));

  const lastStore = useQuery<{ store_id: string }>('SELECT store_id FROM purchases ORDER BY date DESC LIMIT 1').data[0]?.store_id;
  const storeId = pickedStore ?? lastStore ?? null;
  const entries = useQuery<Ticked>(
    `SELECT e.id, e.item_id, e.group_id, e.quantity, i.name, i.unit, i.sold_by_weight FROM list_entries e
     LEFT JOIN items i ON i.id = e.item_id WHERE e.ticked = 1 ORDER BY e.group_id IS NULL, i.name COLLATE NOCASE`
  ).data;
  // Archived groups too: a ticked group entry can still be completed with its last members (groups spec 5.5).
  const groups = new Map(useQuery<GroupInfo>('SELECT id, kind, person, base_unit FROM item_groups').data.map((g) => [g.id, g]));
  const members = useQuery<MemberInfo>(
    `SELECT m.group_id, i.id, i.name, i.unit, i.sold_by_weight, i.contents_qty, i.contents_unit FROM item_group_members m
     JOIN items i ON i.id = m.item_id WHERE i.active = 1 ORDER BY i.name COLLATE NOCASE`
  ).data;
  const lastPrice = new Map(useQuery<{ item_id: string; unit_cents: number | null }>(LAST_PRICE_SQL).data.map((p) => [p.item_id, p.unit_cents]));
  const storePrice = new Map(
    useQuery<{ item_id: string; unit_cents: number }>(STORE_PRICE_SQL, [storeId ?? '']).data.map((p) => [p.item_id, p.unit_cents])
  );
  const priceOf = (itemId: string) => storePrice.get(itemId) ?? lastPrice.get(itemId) ?? null;

  const cards = entries.map((e) => {
    const g = e.group_id ? groups.get(e.group_id) : undefined;
    const options = g
      ? cheapestOption(
          members
            .filter((m) => m.group_id === g.id && holds(m, g.base_unit) !== null)
            .map((m) => ({ ...m, holds: holds(m, g.base_unit) as number, unitCents: priceOf(m.id) }))
        )
      : [];
    const lineIds = [0, ...(extra[e.id] ?? [])];
    const lines = lineIds.map((n) => {
      const key = `${e.id}:${n}`;
      const own = typed[key] ?? {};
      const chosen = g ? options.find((o) => o.id === (own.itemId ?? (n === 0 ? options[0]?.id : undefined))) : undefined;
      const itemId = g ? (chosen?.id ?? null) : e.item_id;
      const defaultQty = g ? (n === 0 && chosen ? String(hintCount(e.quantity, chosen.holds)) : '') : String(e.quantity);
      const quantity = own.quantity ?? defaultQty;
      const q = parseDecimal(quantity);
      const unitCents = itemId ? priceOf(itemId) : null;
      const price = own.price ?? (typeof q === 'number' && q > 0 ? prefillPrice(unitCents, q) : '');
      const soldByWeight = g ? chosen?.sold_by_weight === 1 : e.sold_by_weight === 1;
      const unit = g ? (chosen?.unit ?? '') : (e.unit ?? '');
      return { key, n, itemId, quantity, price, soldByWeight, unit };
    });
    return { entry: e, group: g, options, lines };
  });
  const lines = cards.flatMap((c) => c.lines.map((l) => ({ ...l, entryId: c.entry.id })));

  // Returns the switch that lets a successful save leave without the discard prompt.
  const allowLeave = usePreventRemove(Object.keys(typed).length > 0 || Object.keys(extra).length > 0, ({ repeat }) =>
    Alert.alert('Discard this trip?', undefined, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ])
  );

  const type = (key: string, change: Typed) => {
    setTyped((all) => ({ ...all, [key]: { ...all[key], ...change } }));
    setErrors(({ [key]: _, ...rest }) => rest);
  };
  const addLine = (entryId: string) =>
    setExtra((all) => {
      const ids = all[entryId] ?? [];
      return { ...all, [entryId]: [...ids, (ids[ids.length - 1] ?? 0) + 1] };
    });
  const removeLine = (entryId: string, n: number) => setExtra((all) => ({ ...all, [entryId]: (all[entryId] ?? []).filter((x) => x !== n) }));

  function onSave() {
    if (!storeId) return setStoreError('Pick a shop first');
    const result = validateTrip(
      lines.map((l) => ({ key: l.key, entryId: l.entryId, itemId: l.itemId, quantity: l.quantity, price: l.price, soldByWeight: l.soldByWeight }))
    );
    if (!result.ok) return setErrors(result.errors);
    return guard.run(async () => {
      await completeTrip(storeId, purchaseDate(day, new Date()), result.values);
      allowLeave();
      router.back();
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
      {cards.length ? null : <Text style={{ color: t.textSecondary }}>Nothing ticked on the list.</Text>}
      {cards.map((c) => (
        <View
          key={c.entry.id}
          style={{
            backgroundColor: t.card,
            borderColor: c.lines.some((l) => errors[l.key]) ? t.danger : t.border,
            borderWidth: 1,
            borderRadius: radius.card,
            padding: 12,
            paddingBottom: 0,
            marginBottom: 10,
            boxShadow: t.cardShadow,
          }}
        >
          <Text style={{ fontSize: font.body, fontWeight: '600', color: t.textPrimary, marginBottom: 8 }}>
            {c.group ? `${groupName(c.group)} · about ${c.entry.quantity} ${c.group.base_unit}` : c.entry.name}
          </Text>
          {c.lines.map((l) => (
            <View key={l.key} style={l.n > 0 ? { borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12 } : undefined}>
              {c.group ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {c.options.map((o) => (
                    <Chip key={o.id} label={o.name} on={l.itemId === o.id} onPress={() => type(l.key, { itemId: o.id })} />
                  ))}
                  {c.options.length ? null : <Text style={{ color: t.textSecondary }}>This group has no items left.</Text>}
                </View>
              ) : null}
              <Field label={`Quantity${l.unit ? ` (${l.unit})` : ''}`} value={l.quantity} onChangeText={(v) => type(l.key, { quantity: v })} decimal />
              <Field
                label="Total paid"
                value={l.price}
                onChangeText={(v) => type(l.key, { price: v })}
                decimal
                placeholder="no price yet"
                error={errors[l.key]}
              />
              {c.group && l.n > 0 ? (
                <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                  <PrimaryButton label="Remove this product" variant="outline" onPress={() => removeLine(c.entry.id, l.n)} />
                </View>
              ) : null}
            </View>
          ))}
          {c.group && c.options.length > 1 ? (
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <PrimaryButton label="+ another product" variant="outline" onPress={() => addLine(c.entry.id)} />
            </View>
          ) : null}
        </View>
      ))}

      <View style={{ flexDirection: 'row', paddingTop: 8, paddingBottom: 16 }}>
        <PrimaryButton label={`Save ${lines.length} purchases`} onPress={onSave} disabled={!lines.length} />
      </View>
    </ScrollView>
  );
}
