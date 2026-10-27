import { useQuery } from '@powersync/react-native';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, SectionList, Text, View } from 'react-native';

import { CUSTOM_CATEGORIES_SQL } from '@/categories/categoryRepo';
import { groupByCategory } from '@/categories/categoryRules';
import { Chip } from '@/components/CategoryChips';
import { ItemCard } from '@/components/ItemCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Screen } from '@/components/Screen';
import type { Unit } from '@/items/itemRules';
import { parseDecimal } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { addToList, LAST_PRICE_SQL, makeList, removeEntry, setEntryQuantity, setTicked } from '@/list/listRepo';
import { estimateTotal } from '@/list/listRules';
import { formatMoney } from '@/purchases/purchaseRules';
import { roundQty, stepFor } from '@/stock/stockRules';
import { font } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';
import { useUsage } from '@/usage/useUsage';

type EntryRow = {
  kind: 'entry';
  id: string;
  item_id: string;
  quantity: number;
  added_manually: number;
  ticked: number;
  name: string;
  unit: Unit;
  category: string;
  unit_cents: number | null;
};
type ItemRow = { id: string; name: string; unit: Unit; category: string; buy_mode: string };
type Row = EntryRow | (ItemRow & { kind: 'add' });

export default function ListScreen() {
  const t = useTheme();
  const usage = useUsage().byItem;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));

  const entries = useQuery<Omit<EntryRow, 'kind'>>(
    `SELECT e.id, e.item_id, e.quantity, e.added_manually, e.ticked, i.name, i.unit, i.category, lp.unit_cents
     FROM list_entries e JOIN items i ON i.id = e.item_id
     LEFT JOIN (${LAST_PRICE_SQL}) lp ON lp.item_id = e.item_id
     ORDER BY i.name COLLATE NOCASE`
  ).data.map((e) => ({ ...e, kind: 'entry' as const }));
  const items = useQuery<ItemRow>('SELECT id, name, unit, category, buy_mode FROM items WHERE active = 1 ORDER BY name COLLATE NOCASE').data;
  const custom = useQuery<{ name: string }>(CUSTOM_CATEGORIES_SQL).data.map((c) => c.name);
  const symbol = useQuery<{ currency_symbol: string | null }>('SELECT currency_symbol FROM settings LIMIT 1').data[0]?.currency_symbol ?? 'R';

  const listed = new Set(entries.map((e) => e.item_id));
  const asNeeded = items.filter((i) => i.buy_mode === 'as_needed' && !listed.has(i.id)).map((i) => ({ ...i, kind: 'add' as const }));
  const needsData = items.filter((i) => i.buy_mode === 'monthly' && usage.get(i.id)?.usage.source === 'none').length;
  const total = estimateTotal(entries.map((e) => ({ quantity: e.quantity, unitCents: e.unit_cents })));
  const ticked = entries.filter((e) => e.ticked).length;

  const sections: { title: string; icon: string; data: Row[] }[] = [
    ...groupByCategory(entries, custom, null),
    ...(asNeeded.length ? [{ title: 'As needed', icon: 'plus', data: asNeeded }] : []),
  ];

  function onMake() {
    const suggestions = [...usage.entries()]
      .filter(([, u]) => u.toBuy !== null && u.toBuy > 0)
      .map(([item_id, u]) => ({ item_id, group_id: null, quantity: u.toBuy as number }));
    const run = () => guard.run(() => makeList(suggestions));
    if (!entries.length) return run();
    Alert.alert('Refresh suggestions?', 'Ticked and hand-added items stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Refresh', onPress: run },
    ]);
  }

  function step(e: EntryRow, sign: 1 | -1) {
    const next = roundQty(e.quantity + sign * stepFor(e.unit));
    setDrafts(({ [e.id]: _, ...rest }) => rest);
    if (next > 0) return guard.run(() => setEntryQuantity(e.id, next));
    Alert.alert(`Remove ${e.name} from the list?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => guard.run(() => removeEntry(e.id)) },
    ]);
  }

  // A typed quantity saves on leaving the field; anything that isn't more than 0 snaps back.
  function commitDraft(e: EntryRow) {
    const n = parseDecimal(drafts[e.id] ?? '');
    setDrafts(({ [e.id]: _, ...rest }) => rest);
    if (typeof n === 'number' && n > 0 && roundQty(n) !== e.quantity) guard.run(() => setEntryQuantity(e.id, roundQty(n)));
  }

  const caption = { fontSize: font.caption, color: t.textSecondary };

  return (
    <Screen>
      <Text style={{ ...caption, marginBottom: 8 }}>
        {[
          `${entries.length} items · about ${formatMoney(total.cents, symbol)}`,
          total.unpriced ? `${total.unpriced} without a price` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <PrimaryButton label={entries.length ? 'Refresh' : 'Make list'} variant="outline" onPress={onMake} />
      </View>
      {needsData ? <Text style={{ ...caption, marginTop: 8 }}>{needsData} monthly items need data</Text> : null}
      {entries.length ? null : (
        <Text style={{ textAlign: 'center', color: t.textSecondary, marginTop: 24 }}>No list yet. Tap Make list after a stock-take.</Text>
      )}
      <SectionList<Row, { title: string; icon: string }>
        sections={sections}
        keyExtractor={(r) => `${r.kind}-${r.id}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textSecondary, paddingTop: 12, paddingBottom: 8 }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, section }) =>
          item.kind === 'add' ? (
            <ItemCard
              name={item.name}
              icon={section.icon}
              meta={item.unit}
              right={<Chip label="Add" on={false} onPress={() => guard.run(() => addToList(item.id, 1, false))} />}
            />
          ) : (
            <Pressable
              onPress={() => guard.run(() => setTicked(item.id, !item.ticked))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!item.ticked }}
              accessibilityLabel={item.name}
            >
              <ItemCard
                name={item.ticked ? `✓ ${item.name}` : item.name}
                icon={section.icon}
                muted={!!item.ticked}
                meta={[
                  item.unit_cents === null ? 'no price yet' : `about ${formatMoney(Math.round(item.quantity * item.unit_cents), symbol)}`,
                  item.added_manually ? 'added' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  <QuantityStepper
                    value={drafts[item.id] ?? String(item.quantity)}
                    placeholder=""
                    onMinus={() => step(item, -1)}
                    onPlus={() => step(item, 1)}
                    onChangeText={(text) => setDrafts((d) => ({ ...d, [item.id]: text }))}
                    onBlur={() => commitDraft(item)}
                    label={item.name}
                  />
                }
              />
            </Pressable>
          )
        }
        ListFooterComponent={
          <View style={{ flexDirection: 'row', paddingTop: 8 }}>
            <Link href={{ pathname: '/item/[id]', params: { id: 'new', list: '1' } }} asChild>
              <PrimaryButton label="+ New item" variant="outline" />
            </Link>
          </View>
        }
      />
      <View style={{ flexDirection: 'row', paddingTop: 8, paddingBottom: 16 }}>
        <Link href="/trip/complete" asChild disabled={!ticked}>
          <PrimaryButton label={`Complete trip (${ticked})`} disabled={!ticked} />
        </Link>
      </View>
    </Screen>
  );
}
