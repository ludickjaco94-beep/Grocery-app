import { useQuery } from '@powersync/react-native';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/CategoryChips';
import { Field } from '@/components/Field';
import { FrequencyToggle } from '@/components/FrequencyToggle';
import { ItemCard } from '@/components/ItemCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { addMember, addPerson, createGroup, GROUPS_SQL, PEOPLE_SQL, removeMember, setGroupActive, updateGroup, type GroupRow } from '@/groups/groupRepo';
import { groupName, holds, validateGroup, type GroupForm, type Measurable } from '@/groups/groupRules';
import { findDuplicate } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type MemberRow = Measurable & { id: string; name: string };

const str = (n: number | null) => (n === null ? '' : String(n));
const isCount = (u: string) => !['', 'kg', 'L'].includes(u);

export default function GroupEditScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const existing = useQuery<GroupRow>('SELECT * FROM item_groups WHERE id = ?', [id]);
  const settings = useQuery<{ default_buffer_pct: number | null }>('SELECT default_buffer_pct FROM settings LIMIT 1');

  const message = (text: string) => <Text style={{ flex: 1, padding: 16, color: t.textSecondary, backgroundColor: t.bg }}>{text}</Text>;
  if (isNew ? settings.isLoading : existing.isLoading) return message('Loading…');
  const g = existing.data[0];
  if (!isNew && existing.error) return message(`Could not load group: ${existing.error.message}`);
  if (!isNew && !g) return message('Group not found.');

  const initial: GroupForm = isNew
    ? {
        kind: '',
        person: 'Home',
        baseUnit: '',
        buyMode: 'monthly',
        bufferPct: String(settings.data[0]?.default_buffer_pct ?? 10),
        maxMonthsCover: '2',
        estMonthlyUsage: '',
      }
    : {
        kind: g.kind,
        person: g.person,
        baseUnit: g.base_unit,
        buyMode: g.buy_mode,
        bufferPct: str(g.buffer_pct),
        maxMonthsCover: str(g.max_months_cover),
        estMonthlyUsage: str(g.est_monthly_usage),
      };
  return <GroupEditForm id={id} isNew={isNew} initial={initial} />;
}

function GroupEditForm({ id, isNew, initial }: { id: string; isNew: boolean; initial: GroupForm }) {
  const t = useTheme();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof GroupForm, string>>>({});
  const [counting, setCounting] = useState(isCount(initial.baseUnit));
  const [newPerson, setNewPerson] = useState<string | null>(null);
  const [personError, setPersonError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));

  const groups = useQuery<GroupRow>(GROUPS_SQL).data;
  const people = useQuery<{ name: string }>(PEOPLE_SQL).data.map((p) => p.name);
  const members = useQuery<MemberRow>(
    `SELECT i.id, i.name, i.unit, i.sold_by_weight, i.contents_qty, i.contents_unit FROM item_group_members m
     JOIN items i ON i.id = m.item_id WHERE m.group_id = ? AND i.active = 1 ORDER BY i.name COLLATE NOCASE`,
    [id]
  ).data;
  const matches = useQuery<MemberRow>(
    `SELECT id, name, unit, sold_by_weight, contents_qty, contents_unit FROM items
     WHERE active = 1 AND name LIKE ? AND id NOT IN (SELECT item_id FROM item_group_members WHERE group_id = ?)
     ORDER BY name COLLATE NOCASE LIMIT 5`,
    [`%${search.trim()}%`, id]
  ).data;

  const set = <K extends keyof GroupForm>(key: K, value: GroupForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const kinds = [...new Set(groups.map((g) => g.kind))];
  const persons = ['Home', ...people.filter((p) => p.toLowerCase() !== 'home')];
  const base = form.baseUnit.trim();

  const allowLeave = usePreventRemove(JSON.stringify(form) !== JSON.stringify(initial), ({ repeat }) =>
    Alert.alert('Discard changes?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ])
  );

  function onSave() {
    const result = validateGroup(form, groups, isNew ? undefined : id);
    if (!result.ok) return setErrors(result.errors);
    // A new unit must still measure every member, or they'd silently drop out of the group's need.
    const stuck = members.find((m) => holds(m, result.values.base_unit) === null);
    if (stuck) return setErrors({ baseUnit: `Remove ${stuck.name} first: it isn't measured in ${result.values.base_unit}` });
    setErrors({});
    return guard.run(async () => {
      if (isNew) {
        const newId = await createGroup(result.values);
        allowLeave();
        // Straight on to adding items.
        router.replace(`/groups/${newId}`);
      } else {
        await updateGroup(id, result.values);
        allowLeave();
        router.back();
      }
    });
  }

  function onAddPerson() {
    const name = (newPerson ?? '').trim();
    if (!name) return setPersonError('Give the person a name');
    const dup = findDuplicate(name, persons.map((p) => ({ id: p, name: p })));
    if (dup) return setPersonError(`You already have ${dup.name}`);
    return guard.run(async () => {
      await addPerson(name);
      set('person', name);
      setNewPerson(null);
      setPersonError(null);
    });
  }

  function onAddMember(m: MemberRow) {
    // The saved unit, not an unsaved chip change: members are written at once.
    if (holds(m, initial.baseUnit) === null)
      return Alert.alert(`Set what ${m.name} holds in ${initial.baseUnit} first`, 'Open the item and fill in Holds.');
    return guard.run(async () => {
      await addMember(id, m.id);
      setSearch('');
    });
  }

  const label = (text: string) => <Text style={{ fontSize: font.small, fontWeight: '600', color: t.textPrimary, marginBottom: 6 }}>{text}</Text>;
  const error = (text?: string | null) => (text ? <Text style={{ fontSize: font.caption, color: t.danger, marginTop: 4 }}>{text}</Text> : null);
  const section = (children: ReactNode) => <View style={{ marginBottom: 16 }}>{children}</View>;
  const chips = (children: ReactNode) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
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

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'New group' : groupName(initial) }} />

      {kinds.length ? section(chips(kinds.map((k) => <Chip key={k} label={k} on={form.kind === k} onPress={() => set('kind', k)} />))) : null}
      <Field label="Kind" value={form.kind} onChangeText={(v) => set('kind', v)} error={errors.kind} placeholder="Drinks, Snacks, Pasta…" />

      {section(
        <>
          {label('For')}
          {chips(
            <>
              {persons.map((p) => (
                <Chip key={p} label={p} on={form.person === p} onPress={() => set('person', p)} />
              ))}
              <Chip label="+ Person" on={false} onPress={() => setNewPerson('')} />
            </>
          )}
          {newPerson !== null ? (
            <View style={{ marginTop: 8 }}>
              <TextInput
                style={inputStyle}
                value={newPerson}
                onChangeText={(v) => {
                  setNewPerson(v);
                  setPersonError(null);
                }}
                placeholder="Name"
                placeholderTextColor={t.textSecondary}
                accessibilityLabel="Person name"
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <PrimaryButton label="Cancel" variant="outline" onPress={() => setNewPerson(null)} />
                <PrimaryButton label="Add person" onPress={onAddPerson} />
              </View>
            </View>
          ) : null}
          {error(personError)}
        </>
      )}

      {section(
        <>
          {label('Compare per')}
          {chips(
            <>
              {(['kg', 'L'] as const).map((u) => (
                <Chip
                  key={u}
                  label={u}
                  on={!counting && form.baseUnit === u}
                  onPress={() => {
                    setCounting(false);
                    set('baseUnit', u);
                  }}
                />
              ))}
              <Chip
                label="count"
                on={counting}
                onPress={() => {
                  setCounting(true);
                  if (!isCount(form.baseUnit)) set('baseUnit', '');
                }}
              />
            </>
          )}
          {counting ? (
            <TextInput
              style={{ ...inputStyle, marginTop: 8 }}
              value={form.baseUnit}
              onChangeText={(v) => set('baseUnit', v)}
              placeholder="roll, can, sachet…"
              placeholderTextColor={t.textSecondary}
              accessibilityLabel="Count word"
            />
          ) : null}
          {error(errors.baseUnit)}
        </>
      )}

      {section(<FrequencyToggle value={form.buyMode} onChange={(v) => set('buyMode', v)} />)}
      <Field label="Buffer %" value={form.bufferPct} onChangeText={(v) => set('bufferPct', v)} error={errors.bufferPct} decimal />
      <Field
        label="Cap (months of stock)"
        value={form.maxMonthsCover}
        onChangeText={(v) => set('maxMonthsCover', v)}
        error={errors.maxMonthsCover}
        decimal
      />
      <Field
        label={`Monthly estimate (${base || 'unit'})`}
        value={form.estMonthlyUsage}
        onChangeText={(v) => set('estMonthlyUsage', v)}
        error={errors.estMonthlyUsage}
        hint="Used until its items have two stock-takes"
        decimal
      />
      <View style={{ flexDirection: 'row' }}>
        <PrimaryButton label={isNew ? 'Save and add items' : 'Save'} onPress={onSave} />
      </View>

      {isNew ? null : (
        <>
          <Text style={{ fontSize: font.section, fontWeight: '600', color: t.textSecondary, paddingTop: 24, paddingBottom: 8 }}>Items</Text>
          {members.map((m) => (
            <ItemCard
              key={m.id}
              name={m.name}
              icon="swap-horizontal"
              meta={`holds ${holds(m, initial.baseUnit) ?? '?'} ${initial.baseUnit}`}
              right={
                <Chip
                  label="Remove"
                  on={false}
                  onPress={() =>
                    Alert.alert(`Remove ${m.name} from this group?`, undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => guard.run(() => removeMember(id, m.id)) },
                    ])
                  }
                />
              }
            />
          ))}
          <TextInput
            style={{ ...inputStyle, marginTop: 8 }}
            value={search}
            onChangeText={setSearch}
            placeholder="+ Add item: search"
            placeholderTextColor={t.textSecondary}
            accessibilityLabel="Search items to add"
          />
          {search.trim()
            ? matches.map((m) => (
                <Pressable key={m.id} accessibilityRole="button" onPress={() => onAddMember(m)} style={{ minHeight: 48, justifyContent: 'center' }}>
                  <Text style={{ fontSize: font.body, color: t.textPrimary }}>
                    {m.name}
                    <Text style={{ fontSize: font.caption, color: t.textSecondary }}>
                      {holds(m, initial.baseUnit) === null ? '  set what it holds first' : `  holds ${holds(m, initial.baseUnit)} ${initial.baseUnit}`}
                    </Text>
                  </Text>
                </Pressable>
              ))
            : null}
          <View style={{ flexDirection: 'row', marginTop: 24, paddingBottom: 16 }}>
            <PrimaryButton
              label="Archive group"
              variant="outline"
              onPress={() =>
                guard.run(async () => {
                  await setGroupActive(id, false);
                  allowLeave();
                  router.back();
                })
              }
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}
