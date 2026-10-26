import { Pressable, Text, View } from 'react-native';

import { dayLabel, shiftDay } from '@/purchases/purchaseRules';
import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

// In-app day picker: a native date picker would need a dev-client rebuild.
export function DayStepper({ value, onChange, now }: { value: string; onChange: (iso: string) => void; now: Date }) {
  const t = useTheme();
  const atToday = new Date(value).toDateString() === now.toDateString();
  const arrow = (label: string, a11y: string, days: number, disabled = false) => (
    <Pressable
      onPress={() => onChange(shiftDay(value, days, now))}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: t.textPrimary }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surfaceRaised, borderRadius: radius.chip }}>
      {arrow('◀', 'Previous day', -1)}
      <Text style={{ flex: 1, textAlign: 'center', fontSize: font.body, fontWeight: '600', color: t.textPrimary }}>
        {dayLabel(value, now)}
      </Text>
      {arrow('▶', 'Next day', 1, atToday)}
    </View>
  );
}
