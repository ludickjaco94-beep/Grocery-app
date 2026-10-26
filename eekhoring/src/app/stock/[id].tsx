import { useQuery } from '@powersync/react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { parseDecimal } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { adjustStock } from '@/stock/stockRepo';
import { withChanges, type HistoryRow } from '@/stock/stockRules';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

const LABELS: Record<string, string> = { stocktake: 'Stock-take', adjustment: 'Adjusted', purchase: 'Bought' };

export default function ItemStockScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useQuery<{ name: string; unit: string }>('SELECT name, unit FROM items WHERE id = ?', [id]);
  const history = useQuery<HistoryRow>(
    'SELECT id, date, quantity, source, entered_packs FROM stock_counts WHERE item_id = ? ORDER BY date',
    [id]
  );
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not change stock', e instanceof Error ? e.message : String(e))));

  const unit = item.data[0]?.unit ?? '';
  const rows = withChanges(history.data);
  const level = rows[0]?.quantity;

  function change(sign: 1 | -1) {
    const n = parseDecimal(amount);
    if (typeof n !== 'number' || n <= 0) return setError('Enter an amount more than 0');
    setError(null);
    return guard.run(async () => {
      await adjustStock(id, sign * n);
      setAmount('');
    });
  }

  const label = (r: (typeof rows)[number]) =>
    r.source === 'adjustment' && r.change !== null
      ? `${r.change >= 0 ? 'Added' : 'Removed'} ${Math.abs(r.change)}`
      : (LABELS[r.source] ?? r.source);

  return (
    <Screen>
      <Stack.Screen options={{ title: item.data[0]?.name ?? 'Stock' }} />
      <Text style={{ fontSize: font.title, fontWeight: '700', color: t.textPrimary, fontVariant: ['tabular-nums'], paddingVertical: 12 }}>
        {level === undefined ? 'Not counted yet' : `Now: ${level} ${unit}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          style={{
            flex: 1,
            minHeight: 56,
            backgroundColor: t.surfaceRaised,
            borderColor: t.border,
            borderWidth: 1,
            borderRadius: radius.button,
            paddingHorizontal: 14,
            fontSize: font.body,
            color: t.textPrimary,
          }}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Amount"
          placeholderTextColor={t.textSecondary}
          accessibilityLabel="Amount to add or remove"
        />
        <PrimaryButton label="Add" onPress={() => change(1)} />
        <PrimaryButton label="Remove" variant="outline" onPress={() => change(-1)} />
      </View>
      {error ? <Text style={{ color: t.danger, fontSize: font.caption, paddingTop: 4 }}>{error}</Text> : null}
      <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textSecondary, paddingTop: 20, paddingBottom: 8 }}>History</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item: r }) => (
          <View
            style={{
              backgroundColor: t.card,
              borderColor: t.border,
              borderWidth: 1,
              borderRadius: radius.card,
              padding: 12,
              marginBottom: 8,
              boxShadow: t.cardShadow,
            }}
          >
            <Text style={{ fontSize: font.caption, color: t.textSecondary }}>{new Date(r.date).toLocaleString()}</Text>
            <Text style={{ fontSize: font.body, fontWeight: '600', color: t.textPrimary, fontVariant: ['tabular-nums'] }}>
              {label(r)} → {r.quantity} {unit}
              {r.entered_packs !== null ? ` (${r.entered_packs} packs)` : ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: t.textSecondary, marginTop: 32 }}>No counts yet. Do a stock-take or add stock above.</Text>
        }
      />
    </Screen>
  );
}
