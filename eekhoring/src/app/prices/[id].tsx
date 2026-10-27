import { useQuery } from '@powersync/react-native';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { formatMoney, normalPrice, unitPriceCents } from '@/purchases/purchaseRules';
import { font, palettes, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type Row = {
  id: string;
  store_id: string;
  store: string;
  is_city: number;
  date: string;
  quantity: number;
  total_price_cents: number;
  is_special: number;
  regular_price_cents: number | null;
  is_emergency: number;
};

export default function PricesScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useQuery<{ name: string; unit: string; sold_by_weight: number }>('SELECT name, unit, sold_by_weight FROM items WHERE id = ?', [id]).data[0];
  const rows = useQuery<Row>(
    `SELECT p.id, p.store_id, s.name AS store, s.is_city, p.date, p.quantity, p.total_price_cents, p.is_special,
            p.regular_price_cents, p.is_emergency
     FROM purchases p JOIN stores s ON s.id = p.store_id WHERE p.item_id = ? ORDER BY p.date DESC`,
    [id]
  ).data;
  const symbol = useQuery<{ currency_symbol: string | null }>('SELECT currency_symbol FROM settings LIMIT 1').data[0]?.currency_symbol ?? 'R';

  const per = item?.unit ?? '';
  // Rows are newest first, so Map insertion order puts the most recently used store first.
  const byStore = new Map<string, Row[]>();
  for (const r of rows) byStore.set(r.store_id, [...(byStore.get(r.store_id) ?? []), r]);
  const money = (cents: number) => formatMoney(Math.round(cents), symbol);

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: item ? `${item.name} prices` : 'Prices' }} />
      {[...byStore.values()].map((list) => {
        const normal = normalPrice(list);
        return (
          <View
            key={list[0].store_id}
            style={{
              backgroundColor: t.card,
              borderColor: t.border,
              borderWidth: 1,
              borderRadius: radius.card,
              padding: 12,
              marginBottom: 12,
              boxShadow: t.cardShadow,
            }}
          >
            <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textPrimary }}>
              {list[0].store}
              {list[0].is_city ? <Text style={{ fontSize: font.caption, color: t.textSecondary }}>  City</Text> : null}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: t.textPrimary, fontVariant: ['tabular-nums'], marginVertical: 6 }}>
              {normal === null ? 'No normal price yet' : `Normal ${money(normal)} per ${per}`}
            </Text>
            {list.map((r) => (
              <Link key={r.id} href={`/purchase/${r.id}`} asChild>
                <Pressable accessibilityRole="button" style={{ minHeight: 48, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: font.caption, color: t.textSecondary }}>
                      {new Date(r.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    {r.is_special ? (
                      <Text
                        style={{
                          fontSize: font.caption,
                          fontWeight: '700',
                          color: palettes.dark.bg, // dark text reads on both accents (theme test)
                          backgroundColor: t.accent,
                          borderRadius: radius.chip,
                          paddingHorizontal: 8,
                          overflow: 'hidden',
                        }}
                      >
                        SPECIAL
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: font.body, fontWeight: '600', color: t.textPrimary, fontVariant: ['tabular-nums'] }}>
                    {r.quantity} {per} · {money(unitPriceCents(r.total_price_cents, r.quantity))} per {per} · {money(r.total_price_cents)}
                  </Text>
                  {r.is_special ? (
                    <Text style={{ fontSize: font.caption, color: t.textSecondary }}>
                      {r.regular_price_cents !== null
                        ? `normal ${money(r.regular_price_cents)}`
                        : normal !== null
                          ? `normal ${money(normal)}`
                          : 'normal price unknown'}
                    </Text>
                  ) : null}
                  {r.is_emergency ? <Text style={{ fontSize: font.caption, color: t.danger }}>EMERGENCY</Text> : null}
                </Pressable>
              </Link>
            ))}
          </View>
        );
      })}
      {rows.length === 0 ? (
        <Text style={{ textAlign: 'center', color: t.textSecondary, marginTop: 32 }}>No purchases yet. Log one from the Stock screen.</Text>
      ) : null}
    </ScrollView>
  );
}
