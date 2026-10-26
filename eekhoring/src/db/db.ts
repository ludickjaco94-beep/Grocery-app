import { SQLJSOpenFactory, type SQLJSPersister } from '@powersync/adapter-sql-js';
import { type DatabaseSource, PowerSyncDatabase } from '@powersync/react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';

import { AppSchema } from './schema';

const DB_FILE = 'eekhoring.db';

// shortcut: Expo Go persistence uses PowerSync's deprecated sql.js persister (rewrites the whole file per write,
// can corrupt if killed mid-write). Test data only; real data lives in the dev build / APK on the native adapter.
function expoGoPersister(): SQLJSPersister {
  const file = new File(Paths.document, `expogo-${DB_FILE}`);
  return {
    readFile: async () => (file.exists ? file.bytes() : null),
    writeFile: async (data) => file.write(new Uint8Array(data)),
  };
}

const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Local-only: connect() is never called until phase 7 (sharing).
const source: DatabaseSource = isExpoGo
  ? { factory: new SQLJSOpenFactory({ dbFilename: DB_FILE, persister: expoGoPersister() }) }
  : { database: { dbFilename: DB_FILE } };

export const db = new PowerSyncDatabase({ schema: AppSchema, ...source });
