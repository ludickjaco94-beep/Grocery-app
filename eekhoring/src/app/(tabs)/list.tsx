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
import { groupName, hintCount } from '@/groups/groupRules';
import type { Unit } from '@/items/itemRules';
import { parseDecimal } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { addGroupToList, addToList, LAST_PRICE_SQL, makeList, removeEntry, setEntryQuantity, setTicked } from '@/list/listRepo';
import { estimateTotal, type Suggestion } from '@/list/listRules';
import { formatMoney } from '@/purchases/purchaseRules';
import { roundQty, stepFor } from '@/stock/stockRules';
import { font } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';
import { useUsage, type GroupUsage } from '@/usage/useUsage';

type EntryQuery = {
  id: string;
  item_id: string | null;
  group_id: string | null;
  quantity: number;
  added_manually: number;
  ticked: number;
  name: string | null;
  unit: Unit | null;
  category: string | null;
  unit_cents: number | null;
};
// One list row, item or group; for a group, unit is its base unit and unit_cents the cheapest price per base unit.
type EntryRow = Omit<EntryQuery, 'name' | 'unit' | 'category'> & {
  kind: 'entry';
  name: string;
  unit: string;
  category: string;
  group: GroupUsage | null;
};
type AddRow = { kind: 'add' | 'addGroup'; id: string; name: string; unit: string; category: string };
type Row = EntryRow | AddRow;

const MAX_OPTIONS = 5;
const stepOf = (unit: string) => stepFor((unit === 'kg' || unit === 'L' ? unit : 'each') as Unit);

export default function ListScreen() {
  const t = useTheme();
  const { byItem, byGroup } = useUsage();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));

  const raw = useQuery<EntryQuery>(
    `SELECT e.id, e.item_id, e.group_id, e.quantity, e.added_manually, e.ticked, i.name, i.unit, i.category, lp.unit_cents
     FROM list_entries e LEFT JOIN items i ON i.id = e.item_id
     LEFT JOIN (${LAST_PRICE_SQL}) lp ON lp.item_id = e.item_id
     ORDER BY i.name COLLATE NOCASE`
  ).data;
  // Archived groups keep their name, so a ticked entry for one still reads right.
  const allGroups = new Map(
    useQuery<{ id: string; kind: string; person: string; base_unit: string }>('SELECT id, kind, person, base_unit FROM item_groups').data.map((g) => [g.id, g])
  );
  const items = useQuery<{ id: string; name: string; unit: string; category: string; buy_mode: string; max_months_cover: number }>(
    'SELECT id, name, unit, category, buy_mode, max_months_cover FROM items WHERE active = 1 ORDER BY name COLLATE NOCASE'
  ).data;
  const itemMonths = new Map(items.map((i) => [i.id, i.max_months_cover]));
  const custom = useQuery<{ name: string }>(CUSTOM_CATEGORIES_SQL).data.map((c) => c.name);
  const symbol = useQuery<{ currency_symbol: string | null }>('SELECT currency_symbol FROM settings LIMIT 1').data[0]?.currency_symbol ?? 'R';
  const money = (cents: number) => formatMoney(Math.round(cents), symbol);

  const entries: EntryRow[] = raw.map((e) => {
    if (!e.group_id) return { ...e, kind: 'entry', name: e.name ?? '?', unit: e.unit ?? '', category: e.category ?? 'Other', group: null };
    const g = byGroup.get(e.group_id) ?? null;
    const info = allGroups.get(e.group_id);
    return {
      ...e,
      kind: 'entry',
      name: info ? groupName(info) : 'Group',
      unit: info?.base_unit ?? '',
      category: '',
      unit_cents: g?.options[0]?.perBase ?? null,
      group: g,
    };
  });
  const itemEntries = entries.filter((e) => !e.group_id);
  const groupEntries = entries.filter((e) => e.group_id);

  const listedItems = new Set(itemEntries.map((e) => e.item_id));
  const listedGroups = new Set(groupEntries.map((e) => e.group_id));
  const asNeeded: AddRow[] = [
    ...[...byGroup.values()]
      .filter((g) => g.group.buy_mode === 'as_needed' && !listedGroups.has(g.group.id))
      .map((g) => ({ kind: 'addGroup' as const, id: g.group.id, name: g.name, unit: g.group.base_unit, category: '' })),
    ...items
      .filter((i) => i.buy_mode === 'as_needed' && !listedItems.has(i.id) && !byItem.get(i.id)?.groups.length)
      .map((i) => ({ ...i, kind: 'add' as const })),
  ];
  const needsData =
    items.filter((i) => i.buy_mode === 'monthly' && !byItem.get(i.id)?.groups.length && byItem.get(i.id)?.usage.source === 'none').length +
    [...byGroup.values()].filter((g) => g.group.buy_mode === 'monthly' && g.source === 'none').length;
  const total = estimateTotal(entries.map((e) => ({ quantity: e.quantity, unitCents: e.unit_cents })));
  const ticked = entries.filter((e) => e.ticked).length;

  const sections: { title: string; icon: string; data: Row[] }[] = [
    ...(groupEntries.length ? [{ title: 'Groups', icon: 'swap-horizontal', data: groupEntries }] : []),
    ...groupByCategory(itemEntries, custom, null),
    ...(asNeeded.length ? [{ title: 'As needed', icon: 'plus', data: asNeeded }] : []),
  ];

  function onMake() {
    const suggestions: Suggestion[] = [
      ...[...byItem.entries()]
        .filter(([, u]) => u.toBuy !== null && u.toBuy > 0)
        .map(([item_id, u]) => ({ item_id, group_id: null, quantity: u.toBuy as number })),
      ...[...byGroup.values()]
        .filter((g) => g.toBuy !== null && g.toBuy > 0)
        .map((g) => ({ item_id: null, group_id: g.group.id, quantity: g.toBuy as number })),
    ];
    const run = () => guard.run(() => makeList(suggestions));
    if (!entries.length) return run();
    Alert.alert('Refresh suggestions?', 'Ticked and hand-added items stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Refresh', onPress: run },
    ]);
  }

  // Handover 5.6: going over the months-of-stock cap (e.g. stocking up on a special) asks first.
  function saveQuantity(e: EntryRow, next: number) {
    const cap = e.group_id ? byGroup.get(e.group_id)?.cap : e.item_id ? byItem.get(e.item_id)?.cap : null;
    const months = e.group_id ? byGroup.get(e.group_id)?.group.max_months_cover : null;
    const save = () => guard.run(() => setEntryQuantity(e.id, next));
    if (cap === null || cap === undefined || next <= cap || next <= e.quantity) return save();
    Alert.alert(`That's more than ${months ?? itemMonths.get(e.item_id ?? '') ?? 2} months of stock. Keep it?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Keep', onPress: save },
    ]);
  }

  function step(e: EntryRow, sign: 1 | -1) {
    const next = roundQty(e.quantity + sign * stepOf(e.unit));
    setDrafts(({ [e.id]: _, ...rest }) => rest);
    if (next > 0) return saveQuantity(e, next);
    Alert.alert(`Remove ${e.name} from the list?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => guard.run(() => removeEntry(e.id)) },
    ]);
  }

  // A typed quantity saves on leaving the field; anything that isn't more than 0 snaps back.
  function commitDraft(e: EntryRow) {
    const n = parseDecimal(drafts[e.id] ?? '');
    setDrafts(({ [e.id]: _, ...rest }) => rest);
    if (typeof n === 'number' && n > 0 && roundQty(n) !== e.quantity) saveQuantity(e, roundQty(n));
  }

  function meta(e: EntryRow): string {
    const cost = e.unit_cents === null ? 'no price yet' : `about ${money(e.quantity * e.unit_cents)}`;
    if (!e.group_id) return [cost, e.added_manually ? 'added' : null].filter(Boolean).join(' · ');
    const cheapest = e.group?.options[0];
    const hint = cheapest ? ` (${hintCount(e.quantity, cheapest.holds)} × ${cheapest.name})` : '';
    return [`about ${e.quantity} ${e.unit}${hint}`, cost, e.group ? null : 'group archived', e.added_manually ? 'added' : null]
      .filter(Boolean)
      .join(' · ');
  }

  const caption = { fontSize: font.caption, color: t.textSecondary };

  return (
    <Screen>
      <Text style={{ ...caption, marginBottom: 8 }}>
        {[`${entries.length} items · about ${money(total.cents)}`, total.unpriced ? `${total.unpriced} without a price` : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <PrimaryButton label={entries.length ? 'Refresh' : 'Make list'} variant="outline" onPress={onMake} />
      </View>
      {needsData ? <Text style={{ ...caption, marginTop: 8 }}>{needsData} items or groups need data</Text> : null}
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
          item.kind !== 'entry' ? (
            <ItemCard
              name={item.name}
              icon={item.kind === 'addGroup' ? 'swap-horizontal' : section.icon}
              meta={item.kind === 'addGroup' ? `group · per ${item.unit}` : item.unit}
              right={
                <Chip
                  label="Add"
                  on={false}
                  onPress={() => guard.run(() => (item.kind === 'addGroup' ? addGroupToList(item.id, 1, false) : addToList(item.id, 1, false)))}
                />
              }
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
                icon={item.group_id ? 'swap-horizontal' : section.icon}
                muted={!!item.ticked}
                meta={meta(item)}
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
              >
                {item.group && !item.ticked ? (
                  <View style={{ marginTop: 8, marginLeft: 56, gap: 2 }}>
                    {item.group.options.slice(0, MAX_OPTIONS).map((o, i) => (
                      <Text key={o.item_id} style={caption}>
                        {o.name} · {o.perBase === null ? 'no price yet' : `${money(o.perBase)} per ${item.unit}`}
                        {i === 0 && o.perBase !== null ? <Text style={{ color: t.primary, fontWeight: '700' }}>  cheapest</Text> : null}
                      </Text>
                    ))}
                    {item.group.options.length > MAX_OPTIONS ? <Text style={caption}>+{item.group.options.length - MAX_OPTIONS} more</Text> : null}
                  </View>
                ) : null}
              </ItemCard>
            </Pressable>
          )
        }
        ListFooterComponent={
          <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8 }}>
            <Link href="/groups" asChild>
              <PrimaryButton label="Groups" variant="outline" />
            </Link>
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
