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
import { createGuard } from '@/lib/guard';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type ItemRow = ItemValues & { id: string; active: number };

export default function ItemEditScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
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
  return <ItemEditForm id={id} item={isNew ? undefined : item} initial={initial} saved={custom.data.map((c) => c.name)} />;
}

function ItemEditForm({ id, item, initial, saved }: { id: string; item?: ItemRow; initial: ItemForm; saved: string[] }) {
  const t = useTheme();
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

  const save = (values: ItemValues) =>
    guard.run(async () => {
      if (isNew) await createItem(values);
      else await updateItem(id, values);
      router.back();
    });

  function onSave() {
    const result = validateItem({ ...form, category });
    if (!result.ok) return setErrors(result.errors);
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
          {label('Sold by weight (kg)')}
          <Switch
            value={form.soldByWeight}
            onValueChange={(v) => set('soldByWeight', v)}
            accessibilityLabel="Sold by weight"
            trackColor={{ true: t.primary, false: t.border }}
            thumbColor={t.surface}
          />
        </View>
      )}

      {form.soldByWeight
        ? section(hint('Unit: kg. Prices show per kg.'))
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
      {field('estMonthlyUsage', `Monthly estimate (${form.soldByWeight ? 'kg' : form.unit})`, true, 'Used until two stock-takes exist')}
      {form.soldByWeight ? null : field('packSize', 'Pack size (optional)', true)}

      {button(<PrimaryButton label="Save" onPress={onSave} />)}
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
