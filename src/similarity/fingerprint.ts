/**
 * Phase 12 — motion fingerprint of a drill, from the skeleton clip it already carries (pure TS).
 * "Alike" for the owner means *moves the same way*, so the fingerprint describes the motion, not the
 * muscles: body orientation over the loop, hip height, joint-angle means and ranges (sides averaged, so a
 * mirrored capture matches), how much each body part moves, which hands/feet stay on the floor, tempo.
 * Everything is normalised by torso length and expressed in 0..1 so fingerprints compare directly.
 */
import { LM, type Track, type XY } from '../pipeline/types';
import type { FigureClip } from '../figure/prepare';

export type AngleStat = { mean: number; range: number };
export type Fingerprint = {
  /** fractions of loop frames: upright (torso < 45° from vertical), horizontal (45–135°), inverted (> 135°) */
  orientation: [number, number, number];
  /** median hip height above the ankles in torso lengths, clamped to 0..2 then /2 */
  hipHeight: number;
  /** degrees / 180, sides averaged */
  angles: Record<'elbow' | 'shoulder' | 'hip' | 'knee', AngleStat>;
  /** share of total motion by body part (sums to 1) */
  energy: { arms: number; legs: number; torso: number };
  /** motion per second in torso lengths (overall tempo of movement), clamped /3 */
  speed: number;
  /** fraction of frames where hands / feet are at floor level (within 0.2 torso of the lowest joint) */
  contacts: { hands: number; feet: number };
  /** loop length in seconds, clamped /6 */
  seconds: number;
  frames: number;
};

const ok = (p: XY | undefined) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const mid = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angleAt = (a: XY, b: XY, c: XY) => {
  const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
  const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) + 1e-6);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
};
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1))))]; };
const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const KEY = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
const TRIPLES = {
  elbow: [[LM.rightShoulder, LM.rightElbow, LM.rightWrist], [LM.leftShoulder, LM.leftElbow, LM.leftWrist]],
  shoulder: [[LM.rightHip, LM.rightShoulder, LM.rightElbow], [LM.leftHip, LM.leftShoulder, LM.leftElbow]],
  hip: [[LM.rightShoulder, LM.rightHip, LM.rightKnee], [LM.leftShoulder, LM.leftHip, LM.leftKnee]],
  knee: [[LM.rightHip, LM.rightKnee, LM.rightAnkle], [LM.leftHip, LM.leftKnee, LM.leftAnkle]],
} as const;
const ARMS = [LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist];
const LEGS = [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
const TORSO = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.nose];

/** Fingerprint of the clip's loop window (whole clip when there is no loop). Null when too little is known. */
export function fingerprint(clip: FigureClip): Fingerprint | null {
  const i0 = clip.loop?.i0 ?? 0;
  const i1 = clip.loop?.i1 ?? clip.xy.length - 1;
  const frames: Track = clip.xy.slice(i0, i1 + 1).filter((f) => KEY.every((j) => ok(f[j])));
  if (frames.length < 4) return null;
  // torso length (median) for normalisation
  const torsos = frames.map((f) => dist(mid(f[LM.leftShoulder], f[LM.rightShoulder]), mid(f[LM.leftHip], f[LM.rightHip])));
  const T = median(torsos) || 1;

  const orient: [number, number, number] = [0, 0, 0];
  const hipH: number[] = [];
  const angles: Record<keyof typeof TRIPLES, number[]> = { elbow: [], shoulder: [], hip: [], knee: [] };
  const contactsH: number[] = [], contactsF: number[] = [];
  for (const f of frames) {
    const ms = mid(f[LM.leftShoulder], f[LM.rightShoulder]);
    const mh = mid(f[LM.leftHip], f[LM.rightHip]);
    const dx = ms[0] - mh[0], dy = ms[1] - mh[1]; // image y down: dy < 0 = shoulders above hips
    const a = (Math.atan2(Math.abs(dx), -dy) * 180) / Math.PI; // 0 upright, 90 horizontal, 180 inverted
    orient[a < 45 ? 0 : a <= 135 ? 1 : 2]++;
    const ankles = [f[LM.leftAnkle], f[LM.rightAnkle]].filter(ok);
    if (ankles.length) hipH.push((meanOf(ankles.map((p) => p[1])) - mh[1]) / T);
    for (const k of Object.keys(TRIPLES) as (keyof typeof TRIPLES)[]) {
      const vals = TRIPLES[k].map((tri) => (ok(f[tri[0]]) && ok(f[tri[1]]) && ok(f[tri[2]]) ? angleAt(f[tri[0]], f[tri[1]], f[tri[2]]) : NaN)).filter((v) => Number.isFinite(v));
      if (vals.length) angles[k].push(meanOf(vals));
    }
    // floor level ≈ the lowest known joint of this frame (image y max)
    const known = f.filter(ok);
    const floorY = Math.max(...known.map((p) => p[1]));
    const near = (p: XY) => ok(p) && floorY - p[1] < 0.2 * T;
    const hands = [f[LM.leftWrist], f[LM.rightWrist]].filter(ok);
    const feet = [f[LM.leftAnkle], f[LM.rightAnkle]].filter(ok);
    if (hands.length) contactsH.push(hands.some(near) ? 1 : 0);
    if (feet.length) contactsF.push(feet.some(near) ? 1 : 0);
  }
  // motion energy per body part (sum of joint displacements between consecutive frames, torso units)
  const energy = { arms: 0, legs: 0, torso: 0 };
  let total = 0;
  for (let i = 1; i < frames.length; i++) {
    const add = (joints: readonly number[]) => { let s = 0; for (const j of joints) if (ok(frames[i][j]) && ok(frames[i - 1][j])) s += dist(frames[i][j], frames[i - 1][j]) / T; return s; };
    const a = add(ARMS), l = add(LEGS), t = add(TORSO);
    energy.arms += a; energy.legs += l; energy.torso += t; total += a + l + t;
  }
  const n = frames.length;
  const seconds = n / clip.fps;
  const stat = (k: keyof typeof TRIPLES): AngleStat => ({ mean: meanOf(angles[k]) / 180, range: (pct(angles[k], 95) - pct(angles[k], 5)) / 180 });
  return {
    orientation: [orient[0] / n, orient[1] / n, orient[2] / n],
    hipHeight: Math.max(0, Math.min(2, median(hipH))) / 2,
    angles: { elbow: stat('elbow'), shoulder: stat('shoulder'), hip: stat('hip'), knee: stat('knee') },
    energy: total > 0 ? { arms: energy.arms / total, legs: energy.legs / total, torso: energy.torso / total } : { arms: 1 / 3, legs: 1 / 3, torso: 1 / 3 },
    speed: Math.min(3, total / Math.max(0.1, seconds)) / 3,
    contacts: { hands: meanOf(contactsH), feet: meanOf(contactsF) },
    seconds: Math.min(6, seconds) / 6,
    frames: n,
  };
}

/** Weights of the fingerprint parts in the distance (they sum to 1). */
/**
 * Fitted on the owner's 60 verdicts (2026-11-01, scripts/fit-alike.ts): which body part moves (energy) and the
 * body orientation carry the signal; angle statistics did not. With SCALE the 0.8 line flags only near-
 * duplicates (0 false alarms on the verdicts, most "alike" pairs missed — a capture-quality problem, Phase 13).
 */
export const WEIGHTS: Record<keyof Components, number> = { orientation: 0.34, hipHeight: 0, angleMeans: 0, angleRanges: 0, energy: 0.48, contacts: 0.09, speed: 0.09 };

export type Components = { orientation: number; hipHeight: number; angleMeans: number; angleRanges: number; energy: number; contacts: number; speed: number };

/** Per-part distances in 0..1 (what `similarity` weighs; also used offline to fit the weights). */
export function components(a: Fingerprint, b: Fingerprint): Components {
  const l1 = (x: number[], y: number[]) => x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0);
  const keys = ['elbow', 'shoulder', 'hip', 'knee'] as const;
  return {
    orientation: l1(a.orientation, b.orientation) / 2,
    hipHeight: Math.abs(a.hipHeight - b.hipHeight),
    angleMeans: Math.min(1, meanOf(keys.map((k) => Math.abs(a.angles[k].mean - b.angles[k].mean))) * 2),
    angleRanges: Math.min(1, meanOf(keys.map((k) => Math.abs(a.angles[k].range - b.angles[k].range))) * 2),
    energy: l1([a.energy.arms, a.energy.legs, a.energy.torso], [b.energy.arms, b.energy.legs, b.energy.torso]) / 2,
    contacts: (Math.abs(a.contacts.hands - b.contacts.hands) + Math.abs(a.contacts.feet - b.contacts.feet)) / 2,
    speed: Math.abs(a.speed - b.speed),
  };
}

/** Distance → similarity: fitted so the 0.8 line sits at the verdicts' best cut (distance ≈ 0.05). */
export const SCALE = 4.0;

/** 0 = nothing alike, 1 = identical motion. Symmetric. */
export function similarity(a: Fingerprint, b: Fingerprint, w: Record<keyof Components, number> = WEIGHTS, scale = SCALE): number {
  const c = components(a, b);
  const d = (Object.keys(c) as (keyof Components)[]).reduce((s, k) => s + w[k] * c[k], 0);
  return Math.max(0, Math.min(1, 1 - d * scale));
}

/** Default threshold: at or above it two drills "move the same way". Calibrated with the owner (plan Phase 12). */
export const ALIKE_THRESHOLD = 0.8;

export type Pair<T> = { a: T; b: T; score: number };

/** All pairs above `min`, best first. */
export function alikePairs<T>(items: { item: T; fp: Fingerprint | null }[], min = ALIKE_THRESHOLD): Pair<T>[] {
  const out: Pair<T>[] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i].fp, B = items[j].fp;
    if (!A || !B) continue;
    const s = similarity(A, B);
    if (s >= min) out.push({ a: items[i].item, b: items[j].item, score: s });
  }
  return out.sort((x, y) => y.score - x.score);
}
