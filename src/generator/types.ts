/** Pure types for the generator (no DB imports — the repo maps rows onto these). */
import type { FrameworkBlocks } from '../db/types';
import type { Dosage, Equipment, Muscle, Pattern, Slot } from '../db/vocab';

export type GenExercise = {
  id: string;
  name: string;
  pattern: Pattern | null;
  slots: Slot[];
  equipment: Equipment[];
  primaryMuscles: Muscle[];
  dosageDefault: Dosage | null;
  repSeconds: number | null;
  startPose: number[] | null;
  endPose: number[] | null;
  archived: boolean;
};

export type PairingEdge = { aId: string; bId: string; weight: number; directedWeight: number };

export type GenGoal = { id: string; name: string; exerciseId: string | null; active: boolean };

/** One past workout: the exercise ids it used, newest first in the array passed to the generator. */
export type HistoryEntry = { createdAt: number; exerciseIds: string[]; feedback?: 'easy' | 'right' | 'hard' | null };

export type GenInputs = {
  timeAvailableMin?: number;
  energy?: 'low' | 'medium' | 'high';
  /** equipment the user has right now; undefined = everything */
  equipment?: Equipment[];
  focus?: Slot | null;
  /** 0 = safest, most expected picks; 1 = adventurous */
  surprise?: number;
  /** per-workout rest overrides (player timeline) */
  restBetweenRoundsSec?: number;
  restBetweenExercisesSec?: number;
};

export type GenItem = {
  blockId: string;
  slotId: string;
  /** 1-based round (sequence blocks: 1) */
  round: number;
  exerciseId: string;
  dosage: Dosage;
  locked?: boolean;
  /** seconds this item takes (work only) */
  seconds: number;
};

export type GenWorkout = {
  frameworkId: string;
  seed: number;
  inputs: GenInputs;
  items: GenItem[];
  /** slots that had no candidate in the library */
  unfilled: { blockId: string; slotId: string; tags: Slot[] }[];
  totalSeconds: number;
  why: string;
};

export type GenContext = {
  frameworkId: string;
  blocks: FrameworkBlocks;
  library: GenExercise[];
  pairings: PairingEdge[];
  goals: GenGoal[];
  history: HistoryEntry[];
  inputs: GenInputs;
  seed: number;
  /** ids the user removed from this workout (never pick) */
  excluded?: string[];
  /** existing picks to keep (swap / lock): slotKey → exerciseId */
  locked?: Record<string, string>;
};

export const slotKey = (blockId: string, slotId: string) => `${blockId}/${slotId}`;
