/** Controlled vocabularies for tags. Kept small on purpose; the LLM tagger (Phase 4) must map onto these. */
export const PATTERNS = ['push', 'pull', 'squat', 'hinge', 'lunge', 'core', 'rotation', 'carry', 'locomotion', 'mobility', 'stretch', 'skill', 'cardio', 'balance'] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Slots a framework can ask for (product spec §4.4). */
export const SLOTS = ['warmup', 'skill', 'strength', 'pull', 'push', 'legs', 'core', 'cardio', 'mobility', 'locomotion', 'stretch', 'cooldown'] as const;
export type Slot = (typeof SLOTS)[number];

export const EQUIPMENT = ['none', 'mat', 'pullup-bar', 'rings', 'parallettes', 'dumbbells', 'kettlebell', 'band', 'box', 'wall', 'staff', 'blocks'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const INTENSITY = ['low', 'medium', 'high'] as const;
export type Intensity = (typeof INTENSITY)[number];

export const MUSCLES = ['chest', 'shoulders', 'triceps', 'biceps', 'back', 'lats', 'forearms', 'core', 'obliques', 'hip-flexors', 'glutes', 'quads', 'hamstrings', 'calves', 'adductors', 'spine', 'full-body'] as const;
export type Muscle = (typeof MUSCLES)[number];

export type Dosage = { type: 'reps' | 'time'; value: number; perSide?: boolean };
