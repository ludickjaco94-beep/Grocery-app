import { useQuery } from '@powersync/react-native';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { addCategory, CUSTOM_CATEGORIES_SQL } from '@/categories/categoryRepo';
import { orderedCategories, resolveCategory, validateNewCategory } from '@/categories/categoryRules';
import { CategoryChips, Chip } from '@/components/CategoryChips';
import { FrequencyToggle } from '@/components/FrequencyToggle';
import { PrimaryButton } from '@/components/PrimaryButton';
import { createItem, setItemActive, updateItem } from '@/items/itemRepo';
import { emptyItemForm, findDuplicate, itemToForm, UNITS, validateItem, type ItemForm, type ItemValues } from '@/items/itemRules';
import { removeMember } from '@/groups/groupRepo';
import { checkGroupUnits, groupName } from '@/groups/groupRules';
import { createGuard } from '@/lib/guard';
import { addToList } from '@/list/listRepo';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';
import { useUsage } from '@/usage/useUsage';

type ItemRow = ItemValues & { id: string; active: number };

export default function ItemEditScreen() {
  const t = useTheme();
  const { id, list } = useLocalSearchParams<{ id: string; list?: string }>();
  const isNew = id === 'new';
  const existing = useQuery<ItemRow>('SELECT * FROM items WHERE id = ?', [id]);
  const settings = useQuery<{ default_buffer_pct: number | null }>('SELECT default_buffer_pct FROM settings LIMIT 1');
  // Custom categories must be loaded first, or an item in one would resolve to Other.
  const custom = useQuery<{ name: string }>(CUSTOM_CATEGORIES_SQL);

  const message = (text: string) => <Text style={{ flex: 1, padding: 16, color: t.textSecondary, backgroundColor: t.bg }}>{text}</Text>;
  // Wait for the item (or the default buffer for a new item) before building the form.
  if ((isNew ? settings.isLoading : existing.isLoading) || custom.isLoading) return message('Loading…');
  const item = existing.data[0];
  if (!isNew && existing.error) return message(`Could not load item: ${existing.error.message}`);
  if (!isNew && !item) return message('Item not found.');

  const initial = isNew
    ? { ...emptyItemForm, category: 'Other', bufferPct: String(settings.data[0]?.default_buffer_pct ?? 10) }
    : itemToForm(item);
  return (
    <ItemEditForm id={id} item={isNew ? undefined : item} initial={initial} saved={custom.data.map((c) => c.name)} fromList={list === '1'} />
  );
}

function ItemEditForm({
  id,
  item,
  initial,
  saved,
  fromList,
}: {
  id: string;
  item?: ItemRow;
  initial: ItemForm;
  saved: string[];
  fromList: boolean;
}) {
  const t = useTheme();
  const explain = useUsage().byItem.get(id)?.explain;
  const myGroups = useQuery<{ id: string; kind: string; person: string; base_unit: string }>(
    `SELECT g.id, g.kind, g.person, g.base_unit FROM item_group_members m JOIN item_groups g ON g.id = m.group_id
     WHERE m.item_id = ? AND g.active = 1 ORDER BY g.kind COLLATE NOCASE, g.person COLLATE NOCASE`,
    [id]
  ).data;
  const isNew = !item;
  const names = useQuery<{ id: string; name: string }>('SELECT id, name FROM items WHERE active = 1');
  // A just-added category counts at once, before the live query catches up, so the chip never flashes back to Other.
  const [added, setAdded] = useState<string[]>([]);
  const custom = [...saved, ...added.filter((a) => !saved.includes(a))];
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ItemForm, string>>>({});
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', String(e))));

  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const category = resolveCategory(form.category, custom);
  // Matches validateItem: a sold-by-measure item is L or else kg.
  const measure = form.unit === 'L' ? 'L' : 'kg';
  // "count" holds a word (roll, can…); kept as its own flag so clearing the word doesn't hide its input.
  const [counting, setCounting] = useState(!['', 'kg', 'L'].includes(initial.contentsUnit));

  const save = (values: ItemValues) =>
    guard.run(async () => {
      if (isNew) {
        const newId = await createItem(values);
        // Spec 4.3: an item made while shopping goes on the list already ticked.
        if (fromList) await addToList(newId, 1, true);
      } else await updateItem(id, values);
      router.back();
    });

  function onSave() {
    const result = validateItem({ ...form, category });
    if (!result.ok) return setErrors(result.errors);
    // Groups spec 5.5: a unit change must not break a group the item is in.
    const broken = checkGroupUnits(result.values, myGroups);
    if (broken) return setErrors({ contentsQty: broken });
    setErrors({});
    const dup = findDuplicate(result.values.name, names.data, isNew ? undefined : id);
    if (!dup) return save(result.values);
    Alert.alert('Duplicate name', `You already have ${dup.name}. Save anyway?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: () => save(result.values) },
    ]);
  }

  function onAddCategory() {
    const result = validateNewCategory(newCategory ?? '', custom);
    if (!result.ok) return setNewCategoryError(result.error);
    return guard.run(async () => {
      await addCategory(result.name);
      setAdded((a) => [...a, result.name]);
      set('category', result.name);
      setNewCategory(null);
      setNewCategoryError(null);
    });
  }

  const onToggleArchive = () =>
    guard.run(async () => {
      await setItemActive(id, !item!.active);
      router.back();
    });

  const inputStyle = {
    backgroundColor: t.surfaceRaised,
    borderColor: t.border,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: font.body,
    color: t.textPrimary,
  };
  const label = (text: string) => <Text style={{ fontSize: font.small, fontWeight: '600', color: t.textPrimary, marginBottom: 6 }}>{text}</Text>;
  const hint = (text: string) => <Text style={{ fontSize: font.caption, color: t.textSecondary, marginTop: 4 }}>{text}</Text>;
  const error = (text?: string | null) => (text ? <Text style={{ fontSize: font.caption, color: t.danger, marginTop: 4 }}>{text}</Text> : null);
  const section = (children: ReactNode) => <View style={{ marginBottom: 16 }}>{children}</View>;
  const button = (children: ReactNode) => <View style={{ flexDirection: 'row', marginTop: 12 }}>{children}</View>;

  const field = (key: keyof ItemForm, text: string, decimal = false, hintText?: string) =>
    section(
      <>
        {label(text)}
        <TextInput
          style={inputStyle}
          value={form[key] as string}
          onChangeText={(v) => set(key, v)}
          keyboardType={decimal ? 'decimal-pad' : 'default'}
          accessibilityLabel={text}
        />
        {hintText ? hint(hintText) : null}
        {error(errors[key])}
      </>
    );

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Add item' : 'Edit item' }} />
      {field('name', 'Name')}

      {section(
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
          {label('Sold by weight or volume')}
          <Switch
            value={form.soldByWeight}
            onValueChange={(v) => set('soldByWeight', v)}
            accessibilityLabel="Sold by weight or volume"
            trackColor={{ true: t.primary, false: t.border }}
            thumbColor={t.surface}
          />
        </View>
      )}

      {form.soldByWeight
        ? section(
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="kg" on={measure === 'kg'} onPress={() => set('unit', 'kg')} />
                <Chip label="L" on={measure === 'L'} onPress={() => set('unit', 'L')} />
              </View>
              {hint(`Unit: ${measure}. Prices show per ${measure}.`)}
            </>
          )
        : section(
            <>
              {label('Unit')}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {UNITS.map((u) => (
                  <Chip key={u} label={u} on={form.unit === u} onPress={() => set('unit', u)} />
                ))}
              </View>
            </>
          )}

      {section(
        <>
          {label('Category')}
          <CategoryChips
            categories={orderedCategories(custom)}
            selected={category}
            onSelect={(c) => c && set('category', c)}
            includeAll={false}
            trailing={<Chip label="+ New category" on={false} onPress={() => setNewCategory('')} />}
          />
          {newCategory !== null ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput
                style={{ ...inputStyle, flex: 1 }}
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder="New category name"
                placeholderTextColor={t.textSecondary}
                accessibilityLabel="New category name"
                autoFocus
              />
              <View style={{ flexDirection: 'row', width: 96 }}>
                <PrimaryButton label="Add" onPress={onAddCategory} />
              </View>
            </View>
          ) : null}
          {error(newCategoryError)}
        </>
      )}

      {section(
        <>
          {label('Buy')}
          <FrequencyToggle value={form.buyMode} onChange={(m) => set('buyMode', m)} />
        </>
      )}

      {field('bufferPct', 'Buffer %', true, 'Extra on top of average use')}
      {field('maxMonthsCover', 'Cap (months of stock)', true, 'Never suggest more than this')}
      {myGroups.length ? <View style={{ marginTop: -8, marginBottom: 16 }}>{hint(`Set by ${myGroups.map(groupName).join(', ')} while grouped`)}</View> : null}
      {field('estMonthlyUsage', `Monthly estimate (${form.soldByWeight ? measure : form.unit})`, true, 'Used until two stock-takes exist')}
      {form.soldByWeight ? null : field('packSize', 'Pack size (optional)', true)}
      {form.soldByWeight
        ? null
        : section(
            <>
              {label('Holds (optional)')}
              <TextInput
                style={inputStyle}
                value={form.contentsQty}
                onChangeText={(v) => set('contentsQty', v)}
                keyboardType="decimal-pad"
                placeholder="e.g. 0,5 for a 500 ml can"
                placeholderTextColor={t.textSecondary}
                accessibilityLabel="Holds"
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {(['kg', 'L'] as const).map((u) => (
                  <Chip
                    key={u}
                    label={u}
                    on={!counting && form.contentsUnit === u}
                    onPress={() => {
                      setCounting(false);
                      set('contentsUnit', u);
                    }}
                  />
                ))}
                <Chip
                  label="count"
                  on={counting}
                  onPress={() => {
                    setCounting(true);
                    if (['', 'kg', 'L'].includes(form.contentsUnit)) set('contentsUnit', 'each');
                  }}
                />
              </View>
              {counting ? (
                <TextInput
                  style={{ ...inputStyle, marginTop: 8 }}
                  value={form.contentsUnit}
                  onChangeText={(v) => set('contentsUnit', v)}
                  placeholder="roll, can, sachet…"
                  placeholderTextColor={t.textSecondary}
                  accessibilityLabel="What it holds"
                />
              ) : null}
              {hint('How much one of it holds, so prices compare per kg, L or roll')}
              {error(errors.contentsQty ?? errors.contentsUnit)}
            </>
          )}
      {!isNew
        ? section(
            <>
              {label('Groups')}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {myGroups.map((g) => (
                  <Chip
                    key={g.id}
                    label={groupName(g)}
                    on
                    onPress={() =>
                      Alert.alert(`Remove from ${groupName(g)}?`, undefined, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => guard.run(() => removeMember(g.id, id)) },
                      ])
                    }
                  />
                ))}
                <Chip label="+ Group" on={false} onPress={() => router.push({ pathname: '/groups', params: { pick: id } })} />
              </View>
              {hint('Items in one group can stand in for each other')}
            </>
          )
        : null}

      {button(<PrimaryButton label="Save" onPress={onSave} />)}
      {!isNew && explain ? <View style={{ marginTop: 16 }}>{hint(explain)}</View> : null}
      {!isNew
        ? button(
            <Link href={`/stock/${id}`} asChild>
              <PrimaryButton label="Stock & history" variant="outline" />
            </Link>
          )
        : null}
      {!isNew
        ? button(
            <Link href={`/prices/${id}`} asChild>
              <PrimaryButton label="Prices" variant="outline" />
            </Link>
          )
        : null}
      {!isNew && item
        ? button(<PrimaryButton label={item.active ? 'Archive' : 'Restore'} variant="outline" onPress={onToggleArchive} />)
        : null}
    </ScrollView>
  );
}
