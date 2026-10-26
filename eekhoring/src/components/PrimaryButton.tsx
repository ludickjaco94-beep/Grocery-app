import { Pressable, Text, type PressableProps } from 'react-native';

import { palettes, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

// Extra props go to the Pressable so `Link asChild` can pass onPress/href. One style object, never an array.
// 'accent' is the one call-to-action per screen (DESIGN_SPEC 2); dark text reads on both accents.
export function PrimaryButton({
  label,
  variant = 'filled',
  ...rest
}: { label: string; variant?: 'filled' | 'outline' | 'accent' } & Omit<PressableProps, 'style' | 'children'>) {
  const t = useTheme();
  const fill = { filled: t.primary, outline: t.bg, accent: t.accent }[variant];
  const text = { filled: t.onPrimary, outline: t.primary, accent: palettes.dark.bg }[variant];
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
        backgroundColor: fill,
        borderWidth: 2,
        borderColor: variant === 'accent' ? t.accent : t.primary,
        opacity: rest.disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: text }}>{label}</Text>
    </Pressable>
  );
}
