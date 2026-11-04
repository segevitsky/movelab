/**
 * Phase 13 — hold a hidden limb's last detected pose (owner's call, 2026-11-04: "keep the limbs, make them
 * visible"). When a limb's distal joints are unknown in the drawn track for a short run, the last known
 * configuration is carried along with the limb's root joint (the hip for a leg, the shoulder for an arm):
 * translated, never scaled or reshaped. Runs longer than `maxSeconds` stay hidden; runs at the start of a
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
      const src = i > 0 && isKnown(i - 1) ? i - 1 : j < n ? j : -1;
      if (src >= 0 && run <= maxRun) {
        for (let k = i; k < j; k++) {
          const rootNow = xy[k][limb.root], rootSrc = xy[src][limb.root];
          if (!known(rootNow) || !known(rootSrc)) continue;
          const dx = rootNow[0] - rootSrc[0], dy = rootNow[1] - rootSrc[1];
          for (const jt of limb.joints) { const p = xy[src][jt]; if (known(p)) out[k][jt] = [p[0] + dx, p[1] + dy]; }
          held[names[li]]++;
        }
      }
      i = j;
    }
  });
  return { xy: out, held };
}
