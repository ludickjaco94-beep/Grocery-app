import { Switch, Text, TextInput, View } from 'react-native';

import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

export function Field({
  label,
  value,
  onChangeText,
  error,
  hint,
  decimal,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  hint?: string;
  decimal?: boolean;
  placeholder?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: font.small, fontWeight: '600', color: t.textPrimary, marginBottom: 6 }}>{label}</Text>
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
        value={value}
        onChangeText={onChangeText}
        keyboardType={decimal ? 'decimal-pad' : 'default'}
        placeholder={placeholder}
        placeholderTextColor={t.textSecondary}
        accessibilityLabel={label}
      />
      {hint ? <Text style={{ fontSize: font.caption, color: t.textSecondary, marginTop: 4 }}>{hint}</Text> : null}
      {error ? <Text style={{ fontSize: font.caption, color: t.danger, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}

export function SwitchRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, marginBottom: 8 }}>
      <Text style={{ flex: 1, fontSize: font.small, fontWeight: '600', color: t.textPrimary }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ true: t.primary, false: t.border }}
        thumbColor={t.surface}
      />
    </View>
  );
}
