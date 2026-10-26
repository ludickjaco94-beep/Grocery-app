import { useQuery } from '@powersync/react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseDecimal } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { adjustStock } from '@/stock/stockRepo';
import { withChanges, type HistoryRow } from '@/stock/stockRules';

const LABELS: Record<string, string> = { stocktake: 'Stock-take', adjustment: 'Adjusted', purchase: 'Bought' };

export default function ItemStockScreen() {
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
    <View style={styles.screen}>
      <Stack.Screen options={{ title: item.data[0]?.name ?? 'Stock' }} />
      <Text style={styles.level}>{level === undefined ? 'Not counted yet' : `Now: ${level} ${unit}`}</Text>
      <View style={styles.line}>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Amount"
          accessibilityLabel="Amount to add or remove"
        />
        <Pressable style={styles.button} onPress={() => change(1)} accessibilityRole="button">
          <Text style={styles.buttonText}>Add</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.remove]} onPress={() => change(-1)} accessibilityRole="button">
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.header}>History</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item: r }) => (
          <View style={styles.row}>
            <Text style={styles.meta}>{new Date(r.date).toLocaleString()}</Text>
            <Text style={styles.name}>
              {label(r)} → {r.quantity} {unit}
              {r.entered_packs !== null ? ` (${r.entered_packs} packs)` : ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No counts yet. Do a stock-take or add stock above.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#fff' },
  level: { fontSize: 22, fontWeight: '700', paddingBottom: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 48, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  button: { height: 48, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#2e7d32', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  remove: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#2e7d32' },
  removeText: { color: '#2e7d32', fontSize: 16, fontWeight: '700' },
  error: { color: '#c62828', fontSize: 13, paddingTop: 4 },
  header: { fontWeight: '700', fontSize: 14, color: '#555', paddingTop: 20, paddingBottom: 4 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 16 },
  meta: { fontSize: 13, color: '#777' },
  empty: { textAlign: 'center', color: '#777', marginTop: 32 },
});
