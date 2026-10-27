import { useQuery } from '@powersync/react-native';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { CategoryChips, Chip } from '@/components/CategoryChips';
import { SwitchRow } from '@/components/Field';
import { PrimaryButton } from '@/components/PrimaryButton';
import { findDuplicate } from '@/items/itemRules';
import { createGuard } from '@/lib/guard';
import { addStore, STORES_SQL } from '@/stores/storeRepo';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

// Shop chips plus an inline "+ New shop" form. The caller decides the default shop.
export function StorePicker({ value, onChange, error }: { value: string | null; onChange: (id: string) => void; error?: string | null }) {
  const t = useTheme();
  const [newStore, setNewStore] = useState<string | null>(null);
  const [newStoreCity, setNewStoreCity] = useState(true);
  const [newStoreError, setNewStoreError] = useState<string | null>(null);
  const [guard] = useState(() => createGuard((e) => Alert.alert('Could not save', e instanceof Error ? e.message : String(e))));
  const stores = useQuery<{ id: string; name: string; is_city: number }>(STORES_SQL).data;

  function onAddStore() {
    const name = (newStore ?? '').trim();
    if (!name) return setNewStoreError('Give the shop a name');
    const dup = findDuplicate(name, stores);
    if (dup) return setNewStoreError(`You already have ${dup.name}`);
    return guard.run(async () => {
      onChange(await addStore(name, newStoreCity));
      setNewStore(null);
      setNewStoreError(null);
    });
  }

  return (
    <>
      <CategoryChips
        categories={stores}
        selected={stores.find((s) => s.id === value)?.name ?? null}
        onSelect={(name) => {
          const id = stores.find((s) => s.name === name)?.id;
          if (id) onChange(id);
        }}
        includeAll={false}
        trailing={<Chip label="+ New shop" on={false} onPress={() => setNewStore('')} />}
      />
      {newStore !== null ? (
        <View style={{ marginTop: 8 }}>
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
            value={newStore}
            onChangeText={(v) => {
              setNewStore(v);
              setNewStoreError(null);
            }}
            placeholder="Shop name"
            placeholderTextColor={t.textSecondary}
            accessibilityLabel="Shop name"
            autoFocus
          />
          <SwitchRow label="City shop (where the monthly trip goes)" value={newStoreCity} onValueChange={setNewStoreCity} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PrimaryButton label="Cancel" variant="outline" onPress={() => setNewStore(null)} />
            <PrimaryButton label="Add shop" onPress={onAddStore} />
          </View>
        </View>
      ) : null}
      {newStoreError || error ? <Text style={{ fontSize: font.caption, color: t.danger, marginTop: 4 }}>{newStoreError ?? error}</Text> : null}
    </>
  );
}
