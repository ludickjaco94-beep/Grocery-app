import { useQuery } from '@powersync/react-native';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { ItemCard } from '@/components/ItemCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { addMember, GROUPS_SQL, type GroupRow } from '@/groups/groupRepo';
import { groupName, holds, type Measurable } from '@/groups/groupRules';
import { createGuard } from '@/lib/guard';
import { useTheme } from '@/theme/useTheme';

// With ?pick={itemId} (from the item screen), tapping a group adds that item to it.
export default function GroupsScreen() {
  const t = useTheme();
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const groups = useQuery<GroupRow>(GROUPS_SQL).data;
  const item = useQuery<Measurable & { name: string }>(
    'SELECT name, unit, sold_by_weight, contents_qty, contents_unit FROM items WHERE id = ?',
    [pick ?? '']
  ).data[0];
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));

  function onPick(g: GroupRow) {
    if (!pick || !item) return;
    if (holds(item, g.base_unit) === null) return Alert.alert(`Set what ${item.name} holds in ${g.base_unit} first`);
    return guard.run(async () => {
      await addMember(g.id, pick);
      router.back();
    });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: pick ? 'Add to group' : 'Groups' }} />
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ paddingTop: 12 }}
        renderItem={({ item: g }) =>
          pick ? (
            <Pressable accessibilityRole="button" onPress={() => onPick(g)}>
              <ItemCard name={groupName(g)} icon="swap-horizontal" meta={`${g.members} items · per ${g.base_unit}`} right={null} />
            </Pressable>
          ) : (
            <Link href={`/groups/${g.id}`} asChild>
              <Pressable accessibilityRole="button">
                <ItemCard name={groupName(g)} icon="swap-horizontal" meta={`${g.members} items · per ${g.base_unit}`} right={null} />
              </Pressable>
            </Link>
          )
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: t.textSecondary, marginTop: 32 }}>
            No groups yet. A group holds items that can stand in for each other.
          </Text>
        }
      />
      <View style={{ flexDirection: 'row', paddingTop: 8, paddingBottom: 16 }}>
        <Link href="/groups/new" asChild>
          <PrimaryButton label="+ New group" />
        </Link>
      </View>
    </Screen>
  );
}
