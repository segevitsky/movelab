/**
 * Phase 13 — hold a hidden limb's last detected pose (owner's call, 2026-11-04: "keep the limbs, make them
 * visible"). When a limb's distal joints are unknown in the drawn track for a short run, the last known
 * configuration is carried along with the limb's root joint (the hip for a leg, the shoulder for an arm) and,
 * when both ends of the gap are known, blended linearly between them so nothing snaps: translated and
 * interpolated between two detected poses, never scaled or invented. Runs longer than `maxSeconds` stay hidden; runs at the start of a
 * clip borrow the first known pose. The analysis track is untouched.
 */
import { LM, type Track, type XY } from './types';

type LimbDef = { root: number; joints: number[] };
const LIMBS: LimbDef[] = [
  { root: LM.leftHip, joints: [LM.leftKnee, LM.leftAnkle, LM.leftHeel, LM.leftToe] },
  { root: LM.rightHip, joints: [LM.rightKnee, LM.rightAnkle, LM.rightHeel, LM.rightToe] },
  { root: LM.leftShoulder, joints: [LM.leftElbow, LM.leftWrist, LM.leftPinky, LM.leftIndex, LM.leftThumb] },
  { root: LM.rightShoulder, joints: [LM.rightElbow, LM.rightWrist, LM.rightPinky, LM.rightIndex, LM.rightThumb] },
];

const known = (p: XY | undefined) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

export type HoldResult = { xy: Track; /** frames per limb that were filled by a hold */ held: Record<'leftLeg' | 'rightLeg' | 'leftArm' | 'rightArm', number> };

export function holdLimbs(xy: Track, fps: number, opts: { maxSeconds?: number } = {}): HoldResult {
  const maxRun = Math.round((opts.maxSeconds ?? 2) * fps);
  const out: Track = xy.map((fr) => fr.map((p) => [p[0], p[1]] as XY));
  const held = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 };
  const names = ['leftLeg', 'rightLeg', 'leftArm', 'rightArm'] as const;
  LIMBS.forEach((limb, li) => {
    const n = xy.length;
    // a limb frame is "known" when its first two joints (knee+ankle / elbow+wrist) are known
    const isKnown = (i: number) => known(xy[i][limb.joints[0]]) && known(xy[i][limb.joints[1]]) && known(xy[i][limb.root]);
    let i = 0;
    while (i < n) {
      if (isKnown(i)) { i++; continue; }
      let j = i;
      while (j < n && !isKnown(j)) j++;
      const run = j - i;
      const before = i > 0 && isKnown(i - 1) ? i - 1 : -1;
      const after = j < n && isKnown(j) ? j : -1;
      if ((before >= 0 || after >= 0) && run <= maxRun) {
        // the limb's shape relative to its root, at both ends of the gap; blend between them (or hold one end)
        const rel = (src: number, jt: number): XY | null => { const p = xy[src][jt], r = xy[src][limb.root]; return known(p) && known(r) ? [p[0] - r[0], p[1] - r[1]] : null; };
        for (let k = i; k < j; k++) {
          const rootNow = xy[k][limb.root];
          if (!known(rootNow)) continue;
          const w = before >= 0 && after >= 0 ? (k - before) / (after - before) : before >= 0 ? 0 : 1;
          for (const jt of limb.joints) {
            const a = before >= 0 ? rel(before, jt) : null, b = after >= 0 ? rel(after, jt) : null;
            const o = a && b ? [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w] : a ?? b;
            if (o) out[k][jt] = [rootNow[0] + o[0], rootNow[1] + o[1]];
          }
          held[names[li]]++;
        }
      }
      i = j;
    }
  });
  return { xy: out, held };
}
