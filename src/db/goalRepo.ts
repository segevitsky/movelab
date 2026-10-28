import { eq } from 'drizzle-orm';
import type { Db } from './index';
import { goal, type Goal } from './schema';
import type { GoalStage } from './types';
import type { Slot } from './vocab';
import { newId } from './repo';

export async function listGoals(db: Db): Promise<Goal[]> {
  return db.select().from(goal);
}

export async function setGoalActive(db: Db, id: string, active: boolean) {
  await db.update(goal).set({ active }).where(eq(goal.id, id));
}

export async function linkStageExercise(db: Db, g: Goal, stageIndex: number, exerciseId: string | null) {
  const stages = g.stages.map((s, i) => (i === stageIndex ? { ...s, exerciseId } : s));
  await db.update(goal).set({ stages }).where(eq(goal.id, g.id));
}

export async function updateStage(db: Db, g: Goal, stageIndex: number, patch: Partial<GoalStage>) {
  const stages = g.stages.map((s, i) => (i === stageIndex ? { ...s, ...patch } : s));
  await db.update(goal).set({ stages }).where(eq(goal.id, g.id));
}

/** Passing a stage moves to the next one; the last stage marks the goal complete (inactive). */
export async function markStagePassed(db: Db, g: Goal) {
  const next = g.currentStage + 1;
  if (next >= g.stages.length) await db.update(goal).set({ currentStage: g.stages.length - 1, active: false, notes: `${g.notes ? g.notes + ' · ' : ''}completed ${new Date().toLocaleDateString()}` }).where(eq(goal.id, g.id));
  else await db.update(goal).set({ currentStage: next }).where(eq(goal.id, g.id));
}

export async function setCurrentStage(db: Db, g: Goal, index: number) {
  await db.update(goal).set({ currentStage: Math.max(0, Math.min(g.stages.length - 1, index)) }).where(eq(goal.id, g.id));
}

export async function createGoal(db: Db, args: { name: string; slot: Slot; stages: { name: string; criterion: string }[] }) {
  const id = newId('goal');
  await db.insert(goal).values({ id, name: args.name, slot: args.slot, stages: args.stages.map((s) => ({ ...s, exerciseId: null, slot: args.slot })), currentStage: 0, active: true, notes: null });
  return id;
}

export async function deleteGoal(db: Db, id: string) {
  await db.delete(goal).where(eq(goal.id, id));
}

export async function addStage(db: Db, g: Goal, stage: { name: string; criterion: string }) {
  await db.update(goal).set({ stages: [...g.stages, { ...stage, exerciseId: null, slot: g.slot ?? undefined }] }).where(eq(goal.id, g.id));
}

export async function removeStage(db: Db, g: Goal, index: number) {
  const stages = g.stages.filter((_, i) => i !== index);
  await db.update(goal).set({ stages, currentStage: Math.min(g.currentStage, Math.max(0, stages.length - 1)) }).where(eq(goal.id, g.id));
}
