import { Pressable, Text, type PressableProps } from 'react-native';

import { radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

// Extra props go to the Pressable so `Link asChild` can pass onPress/href. One style object, never an array.
export function PrimaryButton({
  label,
  variant = 'filled',
  ...rest
}: { label: string; variant?: 'filled' | 'outline' } & Omit<PressableProps, 'style' | 'children'>) {
  const t = useTheme();
  const filled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={{
        flex: 1,
        minHeight: 56,
        borderRadius: radius.button,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        backgroundColor: filled ? t.primary : t.bg,
        borderWidth: 2,
        borderColor: t.primary,
        opacity: rest.disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: filled ? t.onPrimary : t.primary }}>{label}</Text>
    </Pressable>
  );
}
