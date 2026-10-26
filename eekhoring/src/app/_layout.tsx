import { PowerSyncContext } from '@powersync/react-native';
import { Stack } from 'expo-router';

import { db } from '@/db/db';

export default function RootLayout() {
  return (
    <PowerSyncContext.Provider value={db}>
      <Stack />
    </PowerSyncContext.Provider>
  );
}
