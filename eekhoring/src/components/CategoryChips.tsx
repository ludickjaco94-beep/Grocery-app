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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} keyboardShouldPersistTaps="handled">
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
        minHeight: 48,
        paddingHorizontal: 16,
        justifyContent: 'center',
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
