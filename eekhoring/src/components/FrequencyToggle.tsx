import { Pressable, Text, View } from 'react-native';

import type { BuyMode } from '@/items/itemRules';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

const OPTIONS: { value: BuyMode; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'as_needed', label: 'As needed' },
];

export function FrequencyToggle({ value, onChange }: { value: BuyMode; onChange: (v: BuyMode) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surfaceRaised, borderRadius: radius.chip, padding: 4 }}>
      {OPTIONS.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: radius.chip,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? t.primary : t.surfaceRaised,
            }}
          >
            <Text style={{ fontSize: font.small, fontWeight: '600', color: on ? t.onPrimary : t.textPrimary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
