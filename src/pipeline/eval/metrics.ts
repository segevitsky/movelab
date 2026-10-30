/**
 * Phase 2.5 step 1 — plausibility metrics (pure). Computed on a processed segment so every later
 * step (contacts, floor, 3D check, depth) reports its delta against the same numbers.
 *
 *  float      mean |contact point − floor| / torso, over frames where the point is in contact
 *  skate      mean displacement (px / torso) of a planted point per frame while in contact
 *  boneJump   % of bone-frames where the 3D bone length changes > 20 % vs the previous frame
 *  flagged    % of limb-frames flagged implausible by the sanity check
 *  depthFlips left/right draw-order switches per second (legs + arms), from 3D depth
 */
import { hypot2, median } from '../math';
import { torsoLengths } from '../clean';
import { LM, type Limb, type SanityIssue, type Track, type XY } from '../types';

export type ContactPoint = 'heelL' | 'heelR' | 'toeL' | 'toeR' | 'handL' | 'handR';
export type Contacts = Record<ContactPoint, boolean[]>;
export const CONTACT_JOINT: Record<ContactPoint, number> = { heelL: LM.leftHeel, heelR: LM.rightHeel, toeL: LM.leftToe, toeR: LM.rightToe, handL: LM.leftWrist, handR: LM.rightWrist };

/** Floor in image space: y = a·x + b + c·z (c = depth term, px per metre of world z; 0 → a line). */
export type FloorLine = { a: number; b: number; c?: number };
export const floorYAt = (f: FloorLine, x: number, z = 0) => f.a * x + f.b + (f.c ?? 0) * z;

export type World = ([number, number, number][] | undefined)[]; // [frame][33] metres, undefined when unknown

/** Bones used for the 3D length metrics, grouped by limb. */
export const LIMB_BONES: Record<Limb, [number, number][]> = {
  leftArm: [[LM.leftShoulder, LM.leftElbow], [LM.leftElbow, LM.leftWrist]],
  rightArm: [[LM.rightShoulder, LM.rightElbow], [LM.rightElbow, LM.rightWrist]],
  leftLeg: [[LM.leftHip, LM.leftKnee], [LM.leftKnee, LM.leftAnkle]],
  rightLeg: [[LM.rightHip, LM.rightKnee], [LM.rightKnee, LM.rightAnkle]],
};

export const dist3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export type Metrics = { float: number; skate: number; boneJump: number; flagged: number; depthFlips: number; frames: number; contactFrames: number };

export function metricFloat(xy: Track, contacts: Contacts, floor: FloorLine, torso: number, world?: World): { value: number; n: number } {
  let s = 0, n = 0;
  (Object.keys(CONTACT_JOINT) as ContactPoint[]).forEach((cp) => {
    const j = CONTACT_JOINT[cp];
    contacts[cp].forEach((on, i) => {
      if (!on) return;
      const p = xy[i][j];
      if (Number.isNaN(p[0])) return;
      const z = world?.[i] ? world[i]![j][2] : 0;
      s += Math.abs(p[1] - floorYAt(floor, p[0], z)) / torso;
      n++;
    });
  });
  return { value: n ? s / n : 0, n };
}

export function metricSkate(xy: Track, contacts: Contacts, torso: number): { value: number; n: number } {
  let s = 0, n = 0;
  (Object.keys(CONTACT_JOINT) as ContactPoint[]).forEach((cp) => {
    const j = CONTACT_JOINT[cp];
    for (let i = 1; i < xy.length; i++) {
      if (!contacts[cp][i] || !contacts[cp][i - 1]) continue;
      const a = xy[i - 1][j], b = xy[i][j];
      if (Number.isNaN(a[0]) || Number.isNaN(b[0])) continue;
      s += hypot2(a, b) / torso;
      n++;
    }
  });
  return { value: n ? s / n : 0, n };
}

/** % bone-frames with |len_t / len_{t-1} − 1| > 20 % (3D, metres). */
export function metricBoneJump(world: World, threshold = 0.2): { value: number; n: number } {
  let jumps = 0, n = 0;
  for (const limb of Object.keys(LIMB_BONES) as Limb[]) {
    for (const [a, b] of LIMB_BONES[limb]) {
      let prev: number | null = null;
      for (let i = 0; i < world.length; i++) {
        const w = world[i];
        if (!w) { prev = null; continue; }
        const len = dist3(w[a], w[b]);
        if (prev !== null && prev > 0) { n++; if (Math.abs(len / prev - 1) > threshold) jumps++; }
        prev = len;
      }
    }
  }
  return { value: n ? (100 * jumps) / n : 0, n };
}

/** % limb-frames flagged (4 limbs × frames). */
export function metricFlagged(issues: SanityIssue[], nFrames: number): { value: number; n: number } {
  const set = new Set<string>();
  for (const is of issues) for (const l of is.limbs) set.add(`${is.frame}:${l}`);
  const n = nFrames * 4;
  return { value: n ? (100 * set.size) / n : 0, n };
}

/** Which side is nearer per frame from world z (smaller z = nearer the camera in MediaPipe world coords). */
export function nearSideRaw(world: World, pair: 'legs' | 'arms'): (boolean | null)[] {
  const [l, r] = pair === 'legs' ? [LM.leftKnee, LM.rightKnee] : [LM.leftElbow, LM.rightElbow];
  return world.map((w) => (w ? w[r][2] < w[l][2] : null)); // true = right nearer
}

/** Draw-order switches per second for a boolean series (nulls skipped). */
export function flipsPerSecond(series: (boolean | null)[], fps: number): number {
  let flips = 0, prev: boolean | null = null, n = 0;
  for (const v of series) { if (v === null) continue; n++; if (prev !== null && v !== prev) flips++; prev = v; }
  return n ? flips / (n / fps) : 0;
}

export function metricDepthFlips(rightNearLegs: (boolean | null)[], rightNearArms: (boolean | null)[], fps: number) {
  return { value: flipsPerSecond(rightNearLegs, fps) + flipsPerSecond(rightNearArms, fps), n: rightNearLegs.length };
}

export function torsoOf(xy: Track) {
  return median(torsoLengths(xy));
}

export const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
