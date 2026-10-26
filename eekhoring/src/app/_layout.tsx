import { PowerSyncContext } from '@powersync/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { db } from '@/db/db';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const t = useTheme();
  return (
    <PowerSyncContext.Provider value={db}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      />
    </PowerSyncContext.Provider>
  );
}
