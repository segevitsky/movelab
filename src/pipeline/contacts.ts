/**
 * Phase 2.5 step 2 — contact detection (pure).
 * A point (heels 29/30, toes 31/32, hands = wrists 15/16) is in contact when, for ≥ `minFrames`
 * consecutive frames, (a) its speed is below `maxSpeed` torso-lengths/s and (b) it lies within
 * `margin` torso-lengths of the lowest candidate point *of its own group* (feet vs hands) in that
 * frame — in a side view the floor is not horizontal in the image, so hands and feet that are both
 * planted can differ in image y by a quarter torso (measured on reel 3). Hysteresis: a contact only turns
 * on after `minFrames` qualifying frames and only turns off after `minFrames` disqualifying frames
 * (the lesson from the staff tracker: no flicker).
 */
import { hypot2, median } from './math';
import { LM, type Track, type XY } from './types';

export type ContactPoint = 'heelL' | 'heelR' | 'toeL' | 'toeR' | 'handL' | 'handR';
export type Contacts = Record<ContactPoint, boolean[]>;
export const CONTACT_JOINT: Record<ContactPoint, number> = { heelL: LM.leftHeel, heelR: LM.rightHeel, toeL: LM.leftToe, toeR: LM.rightToe, handL: LM.leftWrist, handR: LM.rightWrist };
export const CONTACT_POINTS = Object.keys(CONTACT_JOINT) as ContactPoint[];

export type ContactOptions = {
  /** torso-lengths per second */
  maxSpeed?: number; // 1.0
  /** torso-lengths above the lowest candidate point */
  margin?: number; // 0.12
  /** frames of hysteresis (on and off) */
  minFrames?: number; // 4
  /** smoothing window for speed (frames, odd) */
  speedWindow?: number; // 5
  /** hands: within this many torso-lengths of the lowest hand (two planted hands differ by ~0.16 torso in a side view) */
  handMargin?: number; // 0.2
  /** hands count as contact only within this many torso-lengths of the floor fitted from the feet */
  handFloorMargin?: number; // 0.45
};

/** Raw per-frame candidate flags (no hysteresis) — exported for tests / debugging. */
export function contactCandidates(xy: Track, fps: number, torso: number, opts: ContactOptions = {}): Contacts {
  const maxSpeed = opts.maxSpeed ?? 1.0;
  const margin = opts.margin ?? 0.12;
  const win = opts.speedWindow ?? 5;
  const n = xy.length;
  const out = Object.fromEntries(CONTACT_POINTS.map((p) => [p, new Array(n).fill(false)])) as Contacts;
  // per-point speed, averaged over `win` frames
  const speed: Record<ContactPoint, number[]> = Object.fromEntries(CONTACT_POINTS.map((p) => [p, new Array(n).fill(Infinity)])) as Record<ContactPoint, number[]>;
  for (const p of CONTACT_POINTS) {
    const j = CONTACT_JOINT[p];
    const inst: number[] = new Array(n).fill(NaN);
    for (let i = 1; i < n; i++) {
      const a = xy[i - 1][j], b = xy[i][j];
      if (Number.isNaN(a[0]) || Number.isNaN(b[0])) continue;
      inst[i] = (hypot2(a, b) / torso) * fps;
    }
    if (n > 1) inst[0] = inst[1];
    const h = Math.floor(win / 2);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - h); k <= Math.min(n - 1, i + h); k++) if (!Number.isNaN(inst[k])) { s += inst[k]; c++; }
      speed[p][i] = c ? s / c : Infinity;
    }
  }
  const FEET: ContactPoint[] = ['heelL', 'heelR', 'toeL', 'toeR'];
  const HANDS: ContactPoint[] = ['handL', 'handR'];
  // pass 1: feet — within `margin` of the lowest foot point of the frame, and slow
  for (let i = 0; i < n; i++) {
    const ys = FEET.map((p) => xy[i][CONTACT_JOINT[p]][1]).filter((y) => !Number.isNaN(y));
    if (!ys.length) continue;
    const lowest = Math.max(...ys); // image y grows downward
    for (const p of FEET) {
      const q = xy[i][CONTACT_JOINT[p]];
      if (Number.isNaN(q[0])) continue;
      out[p][i] = lowest - q[1] <= margin * torso && speed[p][i] <= maxSpeed;
    }
  }
  // a provisional floor from the planted feet (robust line in image space)
  const feetPts: XY[] = [];
  for (const p of FEET) out[p].forEach((on, i) => { if (on) feetPts.push(xy[i][CONTACT_JOINT[p]]); });
  const floor = feetFloor(feetPts);
  // pass 2: hands — slow, lowest-hand rule, AND near the feet floor (a hand resting on a knee or holding
  // a staff at hip height is slow and "lowest hand" but is not a contact)
  const handMargin = (opts.handFloorMargin ?? 0.45) * torso;
  for (let i = 0; i < n; i++) {
    const ys = HANDS.map((p) => xy[i][CONTACT_JOINT[p]][1]).filter((y) => !Number.isNaN(y));
    if (!ys.length) continue;
    const lowest = Math.max(...ys);
    for (const p of HANDS) {
      const q = xy[i][CONTACT_JOINT[p]];
      if (Number.isNaN(q[0])) continue;
      const nearFloor = floor ? Math.abs(q[1] - (floor.a * q[0] + floor.b)) <= handMargin : false;
      out[p][i] = nearFloor && lowest - q[1] <= (opts.handMargin ?? 0.2) * torso && speed[p][i] <= maxSpeed;
    }
  }
  return out;
}

/** Robust line through the planted feet (median slope over subsampled pairs; horizontal fallback). */
export function feetFloor(pts: XY[]): { a: number; b: number } | null {
  const p = pts.filter((q) => !Number.isNaN(q[0]) && !Number.isNaN(q[1]));
  if (p.length < 4) return null;
  const slopes: number[] = [];
  const step = Math.max(1, Math.floor(p.length / 60));
  for (let i = 0; i < p.length; i += step) for (let j = i + step; j < p.length; j += step) { const dx = p[j][0] - p[i][0]; if (Math.abs(dx) > 2) slopes.push((p[j][1] - p[i][1]) / dx); }
  const a = slopes.length ? Math.max(-0.7, Math.min(0.7, median(slopes))) : 0;
  return { a, b: median(p.map((q) => q[1] - a * q[0])) };
}

/** Apply on/off hysteresis of `minFrames` to a boolean series. */
export function hysteresis(series: boolean[], minFrames: number): boolean[] {
  const n = series.length;
  const out = new Array<boolean>(n).fill(false);
  let state = false;
  let run = 0; // consecutive frames contradicting the current state
  for (let i = 0; i < n; i++) {
    if (series[i] !== state) { run++; if (run >= minFrames) { state = series[i]; run = 0; for (let k = i - minFrames + 1; k < i; k++) if (k >= 0) out[k] = state; } }
    else run = 0;
    out[i] = state;
  }
  return out;
}

export function contacts(xy: Track, fps: number, torso: number, opts: ContactOptions = {}): Contacts {
  const minFrames = opts.minFrames ?? 4;
  const cand = contactCandidates(xy, fps, torso, opts);
  return Object.fromEntries(CONTACT_POINTS.map((p) => [p, hysteresis(cand[p], minFrames)])) as Contacts;
}

/** Convenience: either heel or toe of a side. */
export function footContact(c: Contacts, side: 'L' | 'R'): boolean[] {
  const h = side === 'L' ? c.heelL : c.heelR;
  const t = side === 'L' ? c.toeL : c.toeR;
  return h.map((v, i) => v || t[i]);
}
