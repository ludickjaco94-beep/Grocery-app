import { PowerSyncDatabase } from '@powersync/react-native';

import { AppSchema } from './schema';

// Native OP-SQLite adapter: needs the dev build or APK, not Expo Go.
// Local-only: connect() is never called until phase 7 (sharing).
export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'eekhoring.db' },
});
