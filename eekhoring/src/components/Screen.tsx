import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

export function Screen({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.bg, paddingHorizontal: padded ? 16 : 0 }}>{children}</View>;
}
