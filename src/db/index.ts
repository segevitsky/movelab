import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';
import migrations from './migrations/migrations';
import * as schema from './schema';

export const DB_NAME = 'movelab.db';

const sqlite = openDatabaseSync(DB_NAME, { enableChangeListener: true });
sqlite.execSync('PRAGMA journal_mode = WAL;');

export const db: ExpoSQLiteDatabase<typeof schema> = drizzle(sqlite, { schema });
export type Db = typeof db;

/** Run pending migrations at app start. Returns { success, error }. */
export function useDbMigrations() {
  return useMigrations(db, migrations);
}

export { schema };
