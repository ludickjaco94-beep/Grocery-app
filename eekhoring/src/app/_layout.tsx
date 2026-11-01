import { PowerSyncContext } from '@powersync/react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { db } from '@/db/db';
import { applySavedTheme } from '@/settings/settingsRepo';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const t = useTheme();
  useEffect(() => {
    applySavedTheme().catch(() => {}); // A failed read only means the system theme shows.
  }, []);
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
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </PowerSyncContext.Provider>
  );
}
