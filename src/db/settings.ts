import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { schema } from './index';

export const SETTING_SENDER_NAME = 'senderName';

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const rows = await db.select().from(schema.setting).where(eq(schema.setting.key, key));
  return rows[0]?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string) {
  await db.insert(schema.setting).values({ key, value }).onConflictDoUpdate({ target: schema.setting.key, set: { value } });
}
