import { useQuery } from '@powersync/react-native';
import { Link, router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { ItemCard } from '@/components/ItemCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TripCostFields } from '@/components/TripCostFields';
import { createGuard } from '@/lib/guard';
import { formatMoney, unitPriceCents } from '@/purchases/purchaseRules';
import { weightTotals } from '@/savings/savingsRules';
import { useSavings, type TripRow } from '@/savings/useSavings';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';
import { updateTripCosts } from '@/trips/tripRepo';
import { costsToForm, tripTitle, validateCosts, type CostForm } from '@/trips/tripRules';

export default function TripScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useSavings();
  const trip = data.trips.find((x) => x.id === id);
  if (data.isLoading) return <Text style={{ flex: 1, padding: 16, color: t.textSecondary, backgroundColor: t.bg }}>Loading…</Text>;
  if (!trip) return <Text style={{ flex: 1, padding: 16, color: t.textSecondary, backgroundColor: t.bg }}>Trip not found.</Text>;
  return <TripDetail trip={trip} data={data} />;
}

function TripDetail({ trip, data }: { trip: TripRow; data: ReturnType<typeof useSavings> }) {
  const t = useTheme();
  const initial = costsToForm(trip);
  const [form, setForm] = useState<CostForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof CostForm, string>>>({});
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));
  const symbol = useQuery<{ currency_symbol: string | null }>('SELECT currency_symbol FROM settings LIMIT 1').data[0]?.currency_symbol ?? 'R';
  const money = (cents: number) => (cents < 0 ? `−${formatMoney(-cents, symbol)}` : formatMoney(cents, symbol));

  // Savings follow the saved costs, so the numbers never show a half-typed fuel amount.
  const s = data.savingsOf(trip);
  const bought = data.purchases.filter((p) => p.trip_id === trip.id);
  const nameOf = new Map(data.purchases.map((p) => [p.item_id, p.name]));
  const names = (ids: string[]) => ids.map((i) => nameOf.get(i) ?? '?').join(', ');
  const weights = weightTotals(bought);

  const allowLeave = usePreventRemove(JSON.stringify(form) !== JSON.stringify(initial), ({ repeat }) =>
    Alert.alert('Discard changes?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ])
  );

  function onSave() {
    const result = validateCosts(form);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    return guard.run(async () => {
      await updateTripCosts(trip.id, result.values);
      allowLeave();
      router.back();
    });
  }

  const section = (title: string) => (
    <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textSecondary, paddingTop: 16, paddingBottom: 8 }}>{title}</Text>
  );
  const line = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={{ fontSize: font.body, color: t.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: font.body, fontWeight: '600', color: t.textPrimary, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
  const note = (text: string) => <Text style={{ fontSize: font.caption, color: t.textSecondary, marginTop: 6 }}>{text}</Text>;
  const card = (children: ReactNode) => (
    <View
      style={{
        backgroundColor: t.card,
        borderColor: t.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: 12,
        boxShadow: t.cardShadow,
      }}
    >
      {children}
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Trip ${tripTitle(trip.date)}` }} />
      {trip.shops ? <Text style={{ fontSize: font.caption, color: t.textSecondary }}>{trip.shops}</Text> : null}

      {section('Saving')}
      {card(
        <>
          <Text style={{ fontSize: font.caption, color: t.textSecondary }}>Net saving</Text>
          <Text style={{ fontSize: 24, fontWeight: '600', color: s.net >= 0 ? t.positive : t.danger, fontVariant: ['tabular-nums'], marginBottom: 8 }}>
            {money(s.net)}
          </Text>
          {line('Same basket locally', money(s.basketLocal))}
          {line('Paid (normal prices)', money(s.basketCity))}
          {line('Gross saving', money(s.gross))}
          {line('Trip cost', money(s.breakEven))}
          {note(`This trip needs ${money(s.breakEven)} gross saving to cover its costs`)}
          {s.specialGain ? note(`Specials saved ${money(s.specialGain)} (not counted in the saving)`) : null}
          {s.cheaperLocally.length ? note(`Cheaper locally: ${names(s.cheaperLocally)}`) : null}
          {s.noLocal.length ? note(`No local price recorded: ${names(s.noLocal)}`) : null}
          {s.needsNormal.length ? note(`Needs a normal price: ${names(s.needsNormal)}`) : null}
          {weights.perItem.length
            ? note(
                [...weights.perItem.map((w) => `${nameOf.get(w.item_id)} ${w.total} ${w.unit}`), weights.meatKg ? `Meat ${weights.meatKg} kg` : null]
                  .filter(Boolean)
                  .join(' · ')
              )
            : null}
        </>
      )}

      {section('Trip costs')}
      <TripCostFields
        form={form}
        onChange={(k, v) => {
          setForm((f) => ({ ...f, [k]: v }));
          setErrors(({ [k]: _, ...rest }) => rest);
        }}
        errors={errors}
      />
      <View style={{ flexDirection: 'row' }}>
        <PrimaryButton label="Save costs" onPress={onSave} />
      </View>

      {section(`Bought (${bought.length})`)}
      {bought.map((p) => (
        <Link key={p.id} href={`/purchase/${p.id}`} asChild>
          <Pressable accessibilityRole="button">
            <ItemCard
              name={p.name}
              icon="cart-outline"
              meta={`${p.quantity} ${p.unit} · ${formatMoney(Math.round(unitPriceCents(p.total_price_cents, p.quantity)), symbol)} per ${p.unit}${p.is_special ? ' · SPECIAL' : ''}`}
              right={<Text style={{ fontSize: 16, fontWeight: '600', color: t.textPrimary, fontVariant: ['tabular-nums'] }}>{formatMoney(p.total_price_cents, symbol)}</Text>}
            />
          </Pressable>
        </Link>
      ))}
      <View style={{ height: 16 }} />
    </ScrollView>
  );
}
