import { useQuery } from '@powersync/react-native';
import { Link, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

type Row = { id: string; name: string; unit: string; category: string; buy_mode: string; sold_by_weight: number; active: number };

export default function ItemsScreen() {
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const { data } = useQuery<Row>(
    `SELECT id, name, unit, category, buy_mode, sold_by_weight, active FROM items
     WHERE name LIKE ? AND (active = 1 OR ? = 1)
     ORDER BY category COLLATE NOCASE, name COLLATE NOCASE`,
    [`%${search.trim()}%`, showArchived ? 1 : 0]
  );

  const sections = useMemo(() => {
    const byCategory = new Map<string, Row[]>();
    for (const r of data) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
    return [...byCategory].map(([title, rows]) => ({ title, data: rows }));
  }, [data]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Items' }} />
      <TextInput
        style={styles.search}
        placeholder="Search items"
        value={search}
        onChangeText={setSearch}
        accessibilityLabel="Search items"
      />
      <View style={styles.row}>
        <Text>Show archived</Text>
        <Switch value={showArchived} onValueChange={setShowArchived} accessibilityLabel="Show archived" />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        renderSectionHeader={({ section }) => <Text style={styles.header}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Link href={`/item/${item.id}`} asChild>
            <Pressable style={styles.item}>
              <Text style={[styles.name, !item.active && styles.archived]}>{item.name}</Text>
              <Text style={styles.meta}>
                {[item.unit, item.sold_by_weight ? 'by weight' : null, item.buy_mode === 'as_needed' ? 'as needed' : null, item.active ? null : 'archived']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{search ? 'No items match your search.' : 'No items yet. Tap + Add item to start.'}</Text>
        }
      />
      <Link href="/item/new" asChild>
        <Pressable style={styles.add} accessibilityRole="button">
          <Text style={styles.addText}>+ Add item</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#fff' },
  search: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  header: { fontWeight: '700', fontSize: 14, color: '#555', paddingTop: 16, paddingBottom: 4, backgroundColor: '#fff' },
  item: { minHeight: 48, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 16 },
  archived: { color: '#999' },
  meta: { fontSize: 13, color: '#777' },
  empty: { textAlign: 'center', color: '#777', marginTop: 32 },
  add: { backgroundColor: '#2e7d32', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  addText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
