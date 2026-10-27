import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { font, radius } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function ItemCard({
  name,
  icon,
  meta,
  right,
  muted,
  children,
}: {
  name: string;
  icon: string;
  meta: string;
  right: ReactNode;
  muted?: boolean;
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.card,
        borderColor: t.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: 12,
        marginBottom: 10,
        boxShadow: t.cardShadow,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: t.surfaceRaised,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name={icon as IconName} size={22} color={t.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: font.body, fontWeight: '600', color: muted ? t.textSecondary : t.textPrimary }}>{name}</Text>
          {meta ? <Text style={{ fontSize: font.caption, color: t.textSecondary, marginTop: 2 }}>{meta}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

// 'low' uses warning, which only passes contrast as large text: keep the number at 20 bold.
export function StockNumber({ quantity, unit, tone = 'normal' }: { quantity: number | null; unit: string; tone?: 'normal' | 'low' | 'out' }) {
  const t = useTheme();
  if (quantity === null) return <Text style={{ fontSize: font.caption, color: t.textSecondary }}>not counted</Text>;
  const color = { normal: t.textPrimary, low: t.warning, out: t.danger }[tone];
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color, fontVariant: ['tabular-nums'] }}>{quantity}</Text>
      <Text style={{ fontSize: font.caption, color: t.textSecondary }}>{unit} left</Text>
    </View>
  );
}
