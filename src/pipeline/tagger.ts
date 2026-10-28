/**
 * Local, deterministic tag suggestions (no server). Two sources, merged:
 *  1. caption / on-screen text keywords → pattern, slots, equipment
 *  2. skeleton features → body orientation (standing / floor / inverted), periodicity → dosage type
 * The user confirms in Review; nothing here is final.
 */
import { LM, type Track } from './types';
import type { Features } from './features';
import type { Dosage, Equipment, Pattern, Slot } from '../db/vocab';
import { mean, median } from './math';

export type TagSuggestion = {
  name?: string;
  pattern?: Pattern;
  slots: Slot[];
  equipment: Equipment[];
  dosage: Dosage;
  /** why (for the Review screen) */
  reasons: string[];
  posture: 'standing' | 'floor' | 'inverted' | 'hanging' | 'unknown';
};

const KEYWORDS: { re: RegExp; pattern?: Pattern; slots?: Slot[]; equipment?: Equipment[]; name?: string }[] = [
  // specific patterns first — the first pattern match wins
  { re: /skill|handstand|planche|lever|human flag|muscle[- ]?up|staff|stick|bo staff|nunchaku|juggl/i, pattern: 'skill', slots: ['skill'] },
  { re: /push[- ]?ups?|press[- ]?ups?|dips?|pike push/i, pattern: 'push', slots: ['push'] },
  { re: /pull[- ]?ups?|chin[- ]?ups?|rows?\b|lat pull/i, pattern: 'pull', slots: ['pull'] },
  { re: /squats?|pistol|sissy/i, pattern: 'squat', slots: ['legs'] },
  { re: /hinge|deadlift|good morning|hip thrust|bridge|nordic/i, pattern: 'hinge', slots: ['legs'] },
  { re: /lunges?|split squat|step[- ]?ups?|cossack/i, pattern: 'lunge', slots: ['legs'] },
  { re: /burpees?|cardio|hiit|jump|sprint|tabata|emom|conditioning/i, pattern: 'cardio', slots: ['cardio'] },
  { re: /twist|rotation|windmill|russian/i, pattern: 'rotation', slots: ['core'] },
  { re: /core|abs\b|plank|hollow|l[- ]?sit|leg raise|crunch|sit[- ]?ups?/i, pattern: 'core', slots: ['core'] },
  { re: /carry|farmer/i, pattern: 'carry', slots: ['strength'] },
  { re: /crawl|bear|crab|lizard|locomotion/i, pattern: 'locomotion', slots: ['warmup', 'locomotion'] },
  { re: /balance|single[- ]leg|one[- ]leg/i, pattern: 'balance', slots: ['skill'] },
  { re: /stretch|splits?|pancake|hamstring|cool ?down/i, pattern: 'stretch', slots: ['stretch', 'cooldown'] },
  { re: /mobility|cars?\b|flow|hip opener|90\/90|90 90|thoracic|spine/i, pattern: 'mobility', slots: ['mobility', 'warmup'] },
  { re: /warm[- ]?up/i, slots: ['warmup'] },
  { re: /kettlebell|kb\b/i, equipment: ['kettlebell'] },
  { re: /dumbbell|db\b/i, equipment: ['dumbbells'] },
  { re: /pull[- ]?up bar|\bbar\b/i, equipment: ['pullup-bar'] },
  { re: /\brings?\b/i, equipment: ['rings'] },
  { re: /parallettes?|p-?bars/i, equipment: ['parallettes'] },
  { re: /\bbands?\b/i, equipment: ['band'] },
  { re: /staff|stick|\bbo\b/i, equipment: ['staff'] },
  { re: /\bbox\b|bench|chair/i, equipment: ['box'] },
  { re: /\bwall\b/i, equipment: ['wall'] },
  { re: /\bmat\b|yoga mat/i, equipment: ['mat'] },
];

/** Posture from the cleaned track: torso angle vs vertical and height of the hips over the ankles. */
export function posture(xy: Track): TagSuggestion['posture'] {
  if (xy.length === 0) return 'unknown';
  const angles: number[] = [];
  const hipAboveAnkle: number[] = [];
  const hipBelowShoulder: number[] = [];
  for (const f of xy) {
    const ms = [(f[LM.leftShoulder][0] + f[LM.rightShoulder][0]) / 2, (f[LM.leftShoulder][1] + f[LM.rightShoulder][1]) / 2];
    const mh = [(f[LM.leftHip][0] + f[LM.rightHip][0]) / 2, (f[LM.leftHip][1] + f[LM.rightHip][1]) / 2];
    const ma = [(f[LM.leftAnkle][0] + f[LM.rightAnkle][0]) / 2, (f[LM.leftAnkle][1] + f[LM.rightAnkle][1]) / 2];
    const dx = ms[0] - mh[0];
    const dy = ms[1] - mh[1]; // negative = shoulders above hips (image y down)
    angles.push((Math.atan2(Math.abs(dx), -dy) * 180) / Math.PI); // 0 = upright, 90 = horizontal, 180 = inverted
    const torso = Math.hypot(dx, dy) || 1;
    hipAboveAnkle.push((ma[1] - mh[1]) / torso);
    hipBelowShoulder.push(dy < 0 ? 1 : 0);
  }
  const a = median(angles);
  const hipUp = median(hipAboveAnkle);
  if (a > 135) return 'inverted';
  if (a > 55) return 'floor';
  if (hipUp > 1.2 && mean(hipBelowShoulder) > 0.8) return 'standing';
  if (hipUp < 0.6) return 'floor';
  return 'standing';
}

export function suggestTags(input: { xy: Track; features: Features; periodSeconds: number | null; caption?: string | null; ocr?: string | null; username?: string | null }): TagSuggestion {
  const text = `${input.caption ?? ''}\n${input.ocr ?? ''}`;
  const reasons: string[] = [];
  const slots = new Set<Slot>();
  const equipment = new Set<Equipment>();
  let pattern: Pattern | undefined;
  for (const k of KEYWORDS) {
    const m = text.match(k.re);
    if (!m) continue;
    if (k.pattern && !pattern) { pattern = k.pattern; reasons.push(`"${m[0]}" in caption → ${k.pattern}`); }
    k.slots?.forEach((s) => slots.add(s));
    k.equipment?.forEach((e) => equipment.add(e));
  }
  const post = posture(input.xy);
  const active = input.features.activeJoints.map((j) => j.name);
  if (!pattern) {
    if (post === 'inverted') { pattern = 'skill'; slots.add('skill'); reasons.push('inverted posture → skill'); }
    else if (post === 'floor' && active.includes('elbow')) { pattern = 'push'; slots.add('push'); reasons.push('on the floor, elbows active → push'); }
    else if (post === 'floor' && active.includes('hip')) { pattern = 'core'; slots.add('core'); reasons.push('on the floor, hips active → core'); }
    else if (post === 'floor') { pattern = 'mobility'; slots.add('mobility'); reasons.push('floor work → mobility'); }
    else if (post === 'standing' && active.includes('knee') && active.includes('hip')) { pattern = 'squat'; slots.add('legs'); reasons.push('standing, knees + hips active → squat'); }
    else if (post === 'standing' && active.includes('knee')) { pattern = 'lunge'; slots.add('legs'); reasons.push('standing, knees active → lunge'); }
    else if (post === 'standing' && input.features.speed > 1.5) { pattern = 'cardio'; slots.add('cardio'); reasons.push('fast standing movement → cardio'); }
    else if (post === 'standing') { pattern = 'mobility'; slots.add('mobility'); slots.add('warmup'); reasons.push('standing, slow → mobility'); }
  }
  if (input.periodSeconds && input.periodSeconds > 6 && pattern === 'cardio') { pattern = 'mobility'; reasons.push('slow period → mobility'); }
  const dosage: Dosage = input.periodSeconds ? { type: 'reps', value: 8 } : { type: 'time', value: 45 };
  reasons.push(input.periodSeconds ? `periodic (${input.periodSeconds.toFixed(1)} s/rep) → reps` : 'not periodic → time');
  if (slots.size === 0 && pattern) slots.add(pattern === 'squat' || pattern === 'lunge' || pattern === 'hinge' ? 'legs' : pattern === 'cardio' ? 'cardio' : pattern === 'stretch' ? 'stretch' : pattern === 'locomotion' ? 'warmup' : (pattern as Slot));
  return { pattern, slots: [...slots].filter((s) => s), equipment: [...equipment], dosage, reasons, posture: post, name: undefined };
}

/** A reasonable default name from the suggestion and the segment index. */
export function suggestName(s: TagSuggestion, index: number, username?: string | null) {
  const base = s.pattern ? s.pattern[0].toUpperCase() + s.pattern.slice(1) : 'Exercise';
  const who = username ? ` · @${username}` : '';
  return `${base} ${index + 1}${who}`;
}
