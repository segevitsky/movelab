import { desc, eq } from 'drizzle-orm';
import type { Db } from './index';
import { schema } from './index';
import { newId } from './repo';
import type { SectionDrill } from './types';

export async function listSectionPresets(db: Db) {
  return db.select().from(schema.sectionPreset).orderBy(desc(schema.sectionPreset.createdAt));
}

export async function saveSectionPreset(db: Db, args: { name: string; drills: SectionDrill[]; fromBlockName?: string | null }) {
  const id = newId('sec');
  await db.insert(schema.sectionPreset).values({ id, name: args.name.trim() || 'Section', drills: args.drills, fromBlockName: args.fromBlockName ?? null, createdAt: Date.now() });
  return id;
}

export async function deleteSectionPreset(db: Db, id: string) {
  await db.delete(schema.sectionPreset).where(eq(schema.sectionPreset.id, id));
}
