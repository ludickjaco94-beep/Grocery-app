import { Pressable, Text, TextInput, View } from 'react-native';

import { radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

export function QuantityStepper({
  value,
  placeholder,
  onMinus,
  onPlus,
  onChangeText,
  label,
  invalid,
  onBlur,
}: {
  value: string;
  placeholder: string;
  onMinus: () => void;
  onPlus: () => void;
  onChangeText: (text: string) => void;
  label: string;
  invalid?: boolean;
  onBlur?: () => void;
}) {
  const t = useTheme();
  const button = (sign: string, onPress: () => void, a11y: string) => (
    <Pressable
      onPress={onPress}
      accessibilityLabel={a11y}
      accessibilityRole="button"
      style={{
        width: 48,
        height: 48,
        borderRadius: radius.chip,
        backgroundColor: t.surface,
        borderColor: t.border,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: '700', color: t.textPrimary }}>{sign}</Text>
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.surfaceRaised,
        borderRadius: radius.chip,
        borderWidth: 1,
        borderColor: invalid ? t.danger : t.surfaceRaised,
        padding: 2,
      }}
    >
      {button('−', onMinus, `Less ${label}`)}
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={t.textSecondary}
        onChangeText={onChangeText}
        onBlur={onBlur}
        keyboardType="decimal-pad"
        accessibilityLabel={`Count of ${label}`}
        style={{
          width: 64,
          height: 48,
          textAlign: 'center',
          fontSize: 17,
          fontWeight: '700',
          color: t.textPrimary,
          fontVariant: ['tabular-nums'],
        }}
      />
      {button('+', onPlus, `More ${label}`)}
    </View>
  );
}
