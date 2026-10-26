import { useQuery } from '@powersync/react-native';
import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, SectionList, Switch, Text, TextInput, View } from 'react-native';

import { CUSTOM_CATEGORIES_SQL } from '@/categories/categoryRepo';
import { groupByCategory, orderedCategories } from '@/categories/categoryRules';
import { CategoryChips } from '@/components/CategoryChips';
import { ItemCard, StockNumber } from '@/components/ItemCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { CURRENT_STOCK_SQL } from '@/stock/stockRepo';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type Row = {
  id: string;
  name: string;
  unit: string;
  category: string;
  buy_mode: string;
  sold_by_weight: number;
  active: number;
  quantity: number | null;
};

export default function ItemsScreen() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useQuery<Row>(
    `SELECT id, name, unit, category, buy_mode, sold_by_weight, active, cs.quantity FROM items
     LEFT JOIN (${CURRENT_STOCK_SQL}) cs ON cs.item_id = items.id
     WHERE name LIKE ? AND (active = 1 OR ? = 1)
     ORDER BY name COLLATE NOCASE`,
    [`%${search.trim()}%`, showArchived ? 1 : 0]
  );
  const custom = useQuery<{ name: string }>(CUSTOM_CATEGORIES_SQL).data.map((c) => c.name);
  const last = useQuery<{ last: string | null }>(
    "SELECT MAX(date) AS last FROM stock_counts WHERE source = 'stocktake'"
  ).data[0]?.last;

  const sections = groupByCategory(data, custom, selected);
  const sub = [
    `${data.length} items`,
    last ? `last stock-take ${new Date(last).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Stock' }} />
      <Text style={{ fontSize: font.caption, color: t.textSecondary, marginBottom: 12 }}>{sub}</Text>
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
        }}
        placeholder="Search items"
        placeholderTextColor={t.textSecondary}
        value={search}
        onChangeText={setSearch}
        accessibilityLabel="Search items"
      />
      <View style={{ marginTop: 8 }}>
        <CategoryChips categories={orderedCategories(custom)} selected={selected} onSelect={setSelected} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
        <Text style={{ fontSize: font.small, color: t.textSecondary }}>Show archived</Text>
        <Switch
          value={showArchived}
          onValueChange={setShowArchived}
          accessibilityLabel="Show archived"
          trackColor={{ true: t.primary, false: t.border }}
          thumbColor={t.surface}
        />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textSecondary, paddingTop: 12, paddingBottom: 8 }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, section }) => (
          <Link href={`/item/${item.id}`} asChild>
            <Pressable accessibilityRole="button">
              <ItemCard
                name={item.name}
                icon={section.icon}
                muted={!item.active}
                meta={[
                  item.buy_mode === 'as_needed' ? 'As needed' : 'Monthly',
                  item.sold_by_weight ? 'by weight' : item.unit,
                  item.active ? null : 'archived',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<StockNumber quantity={item.quantity} unit={item.unit} />}
              />
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: t.textSecondary, marginTop: 32 }}>
            {search || selected ? 'No items match.' : 'No items yet. Tap + Add item to start.'}
          </Text>
        }
      />
      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8, paddingBottom: 16 }}>
        <Link href="/stocktake" asChild>
          <PrimaryButton label="Stock-take" variant="outline" />
        </Link>
        <Link href="/item/new" asChild>
          <PrimaryButton label="+ Add item" />
        </Link>
      </View>
    </Screen>
  );
}
