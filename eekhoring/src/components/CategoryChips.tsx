import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';

import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

export function CategoryChips({
  categories,
  selected,
  onSelect,
  includeAll = true,
  trailing,
}: {
  categories: { name: string }[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  includeAll?: boolean;
  trailing?: ReactNode;
}) {
  const options = [...(includeAll ? [{ name: 'All', value: null }] : []), ...categories.map((c) => ({ name: c.name, value: c.name }))];
  return (
    // flexGrow 0: a horizontal ScrollView otherwise grows to fill the column and stretches the chips tall.
    <ScrollView
      horizontal
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4, alignItems: 'center' }}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((o) => (
        <Chip key={o.name} label={o.name} on={o.value === selected} onPress={() => onSelect(o.value)} />
      ))}
      {trailing}
    </ScrollView>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        height: 48,
        minWidth: 88,
        paddingHorizontal: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: radius.chip,
        borderWidth: 1,
        backgroundColor: on ? t.primary : t.surfaceRaised,
        borderColor: on ? t.primary : t.border,
      }}
    >
      <Text style={{ fontSize: font.small, fontWeight: on ? '600' : '400', color: on ? t.onPrimary : t.textPrimary }}>{label}</Text>
    </Pressable>
  );
}
