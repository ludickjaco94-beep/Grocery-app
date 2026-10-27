import { useQuery } from '@powersync/react-native';
import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ItemCard } from '@/components/ItemCard';
import { Screen } from '@/components/Screen';
import { formatMoney } from '@/purchases/purchaseRules';
import { monthKey, monthSavings, weightTotals } from '@/savings/savingsRules';
import { useSavings } from '@/savings/useSavings';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';
import { tripTitle } from '@/trips/tripRules';

export default function SavingsScreen() {
  const t = useTheme();
  const data = useSavings();
  const symbol = useQuery<{ currency_symbol: string | null }>('SELECT currency_symbol FROM settings LIMIT 1').data[0]?.currency_symbol ?? 'R';
  const money = (cents: number) => (cents < 0 ? `−${formatMoney(-cents, symbol)}` : formatMoney(cents, symbol));

  const trips = data.trips.map((trip) => ({ trip, s: data.savingsOf(trip) }));
  // A month shows if it had a trip or an emergency buy (which costs savings even without a trip).
  const keys = [
    ...new Set([...trips.map((x) => monthKey(x.trip.date)), ...data.purchases.filter((p) => p.is_emergency).map((p) => monthKey(p.date))]),
  ].sort((a, b) => (a < b ? 1 : -1));
  const months = keys.map((key) => {
    const mine = trips.filter((x) => monthKey(x.trip.date) === key);
    const bought = data.purchases.filter((p) => monthKey(p.date) === key);
    return {
      key,
      trips: mine,
      total: monthSavings(
        mine.map((x) => x.s),
        bought,
        data.purchases,
        data.stores
      ),
      meatKg: weightTotals(bought).meatKg,
    };
  });
  const running = months.reduce((sum, m) => sum + m.total.trueNet, 0);

  const caption = { fontSize: font.caption, color: t.textSecondary };
  const big = (cents: number) => ({ fontSize: 24, fontWeight: '600' as const, color: cents >= 0 ? t.positive : t.danger, fontVariant: ['tabular-nums' as const] });

  if (data.isLoading) return <Text style={{ flex: 1, padding: 16, color: t.textSecondary, backgroundColor: t.bg }}>Loading…</Text>;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <Text style={{ ...caption, marginTop: 8 }}>Saved so far, after trip costs and emergencies</Text>
        <Text style={{ ...big(running), marginBottom: 8 }}>{money(running)}</Text>
        {months.length ? null : (
          <Text style={{ textAlign: 'center', color: t.textSecondary, marginTop: 32 }}>
            No city trips yet. Shop at a city shop and they&apos;ll show here.
          </Text>
        )}
        {months.map((m) => (
          <View key={m.key} style={{ marginTop: 12 }}>
            <View
              style={{
                backgroundColor: t.card,
                borderColor: t.border,
                borderWidth: 1,
                borderRadius: radius.card,
                padding: 12,
                marginBottom: 10,
                boxShadow: t.cardShadow,
              }}
            >
              <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textPrimary }}>
                {new Date(`${m.key}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </Text>
              <Text style={big(m.total.trueNet)}>{money(m.total.trueNet)}</Text>
              <Text style={caption}>
                {[
                  `Trips saved ${money(m.total.net)}`,
                  m.total.penalty ? `Emergencies cost ${money(m.total.penalty)}` : null,
                  m.meatKg ? `Meat ${m.meatKg} kg` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {m.total.specialGain ? <Text style={caption}>Specials saved {money(m.total.specialGain)} (not counted)</Text> : null}
            </View>
            {m.trips.map(({ trip, s }) => (
              <Link key={trip.id} href={`/trips/${trip.id}`} asChild>
                <Pressable accessibilityRole="button">
                  <ItemCard
                    name={tripTitle(trip.date)}
                    icon="car-outline"
                    meta={trip.shops ?? 'no purchases yet'}
                    right={<Text style={{ fontSize: 16, fontWeight: '600', color: s.net >= 0 ? t.positive : t.danger, fontVariant: ['tabular-nums'] }}>{money(s.net)}</Text>}
                  />
                </Pressable>
              </Link>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
