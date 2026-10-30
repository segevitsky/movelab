import type { Dosage, Equipment, Slot } from './vocab';

/** Framework = template of blocks and slots; the generator (Phase 5) fills the slots from the library. */
export type FrameworkSlot = {
  id: string;
  /** any of these slot tags qualifies */
  tags: Slot[];
  /** overrides the exercise's default dosage when set */
  dosage?: Dosage;
  optional?: boolean;
  /** goals take this slot first (skill slot) */
  isSkill?: boolean;
};

export type FrameworkBlock = {
  id: string;
  name: string;
  /** 'sequence' = slots back-to-back once; 'rounds' = repeat the slot list */
  kind: 'sequence' | 'rounds';
  rounds?: number;
  /** total block time budget in seconds (warm-up / cool-down) */
  seconds?: number;
  restBetweenExercisesSec?: number;
  restBetweenRoundsSec?: number;
  slots: FrameworkSlot[];
};

export type FrameworkBlocks = { blocks: FrameworkBlock[]; equipmentAssumed?: Equipment[] };

export type GoalStage = {
  name: string;
  /** library exercise linked by the user; null until linked */
  exerciseId: string | null;
  /** pass criterion, free text ("3 × 30 s clean") */
  criterion: string;
  slot?: Slot;
};

export type WorkoutItem = {
  blockId: string;
  slotId: string;
  round: number;
  exerciseId: string;
  dosage: Dosage;
  locked?: boolean;
};

export type WorkoutInputs = { timeAvailableMin?: number; energy?: 'low' | 'medium' | 'high'; equipment?: Equipment[]; focus?: Slot | null; surprise?: number; /** overrides the framework's rest between rounds for this workout */ restBetweenRoundsSec?: number; restBetweenExercisesSec?: number };

export type SessionFeedback = 'easy' | 'right' | 'hard';

/** Architecture §5a. Mat quad in source pixels (TL, TR, BR, BL); crop rect normalised to the recording. */
export type Scene = {
  matQuad?: [[number, number], [number, number], [number, number], [number, number]];
  cropRect?: { x: number; y: number; width: number; height: number };
  cameraStatic: boolean;
  /** Phase 2.5 fitted floor in figure pixel space: y = a·x + b */
  floor?: { a: number; b: number };
};
