/**
 * Phase 2.5 step 4 — 3D bone-length plausibility (extends the sanity checks).
 * Real bones have a constant 3D length; MediaPipe world lengths are noisy (p95 deviation 13–30 % on the
 * fixtures), so a limb-frame is flagged only on a SUDDEN change (> `jump` vs the previous frame or vs a
 * short rolling median) AND an absolute deviation > `absDev` from the segment median.
 * This is NOT bone-length clamping: flagged limb-frames become unknown (→ gap fill / fallback model);
 * nothing is ever reshaped to a target length.
 */
import { median, savgol } from './math';
import { LM, type Limb, type SanityIssue } from './types';
import type { World } from './floor';

export const LIMB_BONES: Record<Limb, [number, number][]> = {
  leftArm: [[LM.leftShoulder, LM.leftElbow], [LM.leftElbow, LM.leftWrist]],
  rightArm: [[LM.rightShoulder, LM.rightElbow], [LM.rightElbow, LM.rightWrist]],
  leftLeg: [[LM.leftHip, LM.leftKnee], [LM.leftKnee, LM.leftAnkle]],
  rightLeg: [[LM.rightHip, LM.rightKnee], [LM.rightKnee, LM.rightAnkle]],
};
export const LIMB_DISTAL_JOINTS: Record<Limb, number[]> = {
  leftArm: [LM.leftElbow, LM.leftWrist, LM.leftPinky, LM.leftIndex, LM.leftThumb],
  rightArm: [LM.rightElbow, LM.rightWrist, LM.rightPinky, LM.rightIndex, LM.rightThumb],
  leftLeg: [LM.leftKnee, LM.leftAnkle, LM.leftHeel, LM.leftToe],
  rightLeg: [LM.rightKnee, LM.rightAnkle, LM.rightHeel, LM.rightToe],
};
const d3 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export type Bone3dOptions = { jump?: number; absDev?: number; window?: number; /** deviation that is impossible regardless of speed */ hardDev?: number };

/** Per-bone 3D length series (NaN when unknown). */
export function boneLengths(world: World, bone: [number, number]): number[] {
  return world.map((w) => (w ? d3(w[bone[0]], w[bone[1]]) : NaN));
}

function rollingMedian(v: number[], win: number): number[] {
  const h = Math.floor(win / 2);
  return v.map((_, i) => {
    const s: number[] = [];
    for (let k = Math.max(0, i - h); k <= Math.min(v.length - 1, i + h); k++) if (!Number.isNaN(v[k])) s.push(v[k]);
    return s.length ? median(s) : NaN;
  });
}

/** Flag limb-frames whose bone length jumps AND deviates. Returns sanity issues of kind 'bone-length'. */
export function check3dBones(world: World, opts: Bone3dOptions = {}): SanityIssue[] {
  const jump = opts.jump ?? 0.2;
  const absDev = opts.absDev ?? 0.25;
  const win = opts.window ?? 9;
  const hardDev = opts.hardDev ?? 0.4;
  const flagged = new Map<number, Set<Limb>>();
  for (const limb of Object.keys(LIMB_BONES) as Limb[]) {
    for (const bone of LIMB_BONES[limb]) {
      const len = boneLengths(world, bone);
      const segMed = median(len);
      if (!(segMed > 0)) continue;
      const roll = rollingMedian(len, win);
      for (let i = 0; i < len.length; i++) {
        const L = len[i];
        if (Number.isNaN(L)) continue;
        const dev = Math.abs(L / segMed - 1);
        if (dev <= absDev) continue;
        const prev = i > 0 ? len[i - 1] : NaN;
        const jPrev = Number.isNaN(prev) ? 0 : Math.abs(L / prev - 1);
        const jRoll = Number.isNaN(roll[i]) ? 0 : Math.abs(L / roll[i] - 1);
        // a gradual collapse (arm shrinking to a third over ten frames) has no single jump but is impossible
        if (dev > hardDev || jPrev > jump || jRoll > jump) {
          if (!flagged.has(i)) flagged.set(i, new Set());
          flagged.get(i)!.add(limb);
        }
      }
    }
  }
  return [...flagged.entries()].sort((a, b) => a[0] - b[0]).map(([frame, limbs]) => ({ frame, kind: 'bone-length' as const, limbs: [...limbs], detail: '3d' }));
}

/** Set the distal joints of flagged limbs to unknown in a copy of the world track (→ interpolation). */
export function maskFlaggedWorld(world: World, issues: SanityIssue[]): World {
  const out = world.map((w) => (w ? w.map((p) => [p[0], p[1], p[2]] as [number, number, number]) : w));
  for (const is of issues) {
    const w = out[is.frame];
    if (!w) continue;
    for (const limb of is.limbs) for (const j of LIMB_DISTAL_JOINTS[limb]) w[j] = [NaN, NaN, NaN];
  }
  return out;
}

/** Linear gap fill per coordinate on the world track (keeps undefined frames undefined). */
export function fillWorldGaps(world: World): World {
  const n = world.length;
  const out: World = world.map((w) => (w ? w.map((p) => [p[0], p[1], p[2]] as [number, number, number]) : w));
  for (let j = 0; j < 33; j++) {
    for (let c = 0; c < 3; c++) {
      const idx: number[] = [], val: number[] = [];
      for (let i = 0; i < n; i++) { const w = out[i]; if (w && !Number.isNaN(w[j][c])) { idx.push(i); val.push(w[j][c]); } }
      if (idx.length < 2) continue;
      for (let i = 0; i < n; i++) {
        const w = out[i];
        if (!w || !Number.isNaN(w[j][c])) continue;
        // nearest known neighbours
        let lo = -1, hi = -1;
        for (let k = 0; k < idx.length; k++) { if (idx[k] < i) lo = k; if (idx[k] > i) { hi = k; break; } }
        if (lo < 0) w[j][c] = val[hi];
        else if (hi < 0) w[j][c] = val[lo];
        else { const f = (i - idx[lo]) / (idx[hi] - idx[lo]); w[j][c] = val[lo] * (1 - f) + val[hi] * f; }
      }
    }
  }
  return out;
}

/** Savitzky–Golay on each world coordinate (1.0 s, order 2). The 3D track is analysis-only (depth order,
 *  metrics) and never drawn, so a heavier window than the 2D 0.37 s is acceptable; measured: boneJump
 *  0.0–0.6 % on all fixtures vs 0.3–3.7 % raw. */
export function smoothWorld(world: World, fps: number, seconds = 1.0): World {
  const n = world.length;
  const w = Math.max(5, Math.floor(fps * seconds) | 1);
  if (n <= w) return world;
  const out: World = world.map((f) => (f ? f.map((p) => [p[0], p[1], p[2]] as [number, number, number]) : f));
  for (let j = 0; j < 33; j++) {
    for (let c = 0; c < 3; c++) {
      const series = out.map((f) => (f ? f[j][c] : NaN));
      // smooth each contiguous run of known values (undefined frames split runs and stay as they are)
      let i = 0;
      while (i < n) {
        if (Number.isNaN(series[i])) { i++; continue; }
        let k = i;
        while (k < n && !Number.isNaN(series[k])) k++;
        if (k - i > w) {
          const sm = savgol(series.slice(i, k), w, 2);
          for (let m = i; m < k; m++) out[m]![j][c] = sm[m - i];
        }
        i = k;
      }
    }
  }
  return out;
}

/** Full 3D cleaning: flag → mask → fill → smooth. */
export function cleanWorld(world: World, fps: number, opts: Bone3dOptions = {}): { world: World; issues: ReturnType<typeof check3dBones> } {
  const issues = check3dBones(world, opts);
  return { world: smoothWorld(fillWorldGaps(maskFlaggedWorld(world, issues)), fps), issues };
}
