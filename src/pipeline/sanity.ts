import { hypot2, median, percentile } from './math';
import { torsoLengths } from './clean';
import { LM, type Limb, type SanityIssue, type Track } from './types';

export type SanityOptions = {
  /** knees AND ankles (or elbows AND wrists) closer than this × torso → collapse */
  collapseRatio?: number; // 0.2
  /** bone longer than this × its 97th-percentile length → implausible */
  boneRatio?: number; // 1.4
};

const BONES: { limb: Limb; a: number; b: number }[] = [
  { limb: 'leftArm', a: LM.leftShoulder, b: LM.leftElbow }, { limb: 'leftArm', a: LM.leftElbow, b: LM.leftWrist },
  { limb: 'rightArm', a: LM.rightShoulder, b: LM.rightElbow }, { limb: 'rightArm', a: LM.rightElbow, b: LM.rightWrist },
  { limb: 'leftLeg', a: LM.leftHip, b: LM.leftKnee }, { limb: 'leftLeg', a: LM.leftKnee, b: LM.leftAnkle },
  { limb: 'rightLeg', a: LM.rightHip, b: LM.rightKnee }, { limb: 'rightLeg', a: LM.rightKnee, b: LM.rightAnkle },
];

/**
 * Architecture §4.2: model confidence is not trustworthy, so run our own per-frame checks.
 * Returns the frames (and limbs) a fallback model should re-run; the caller replaces only the
 * failing limb and only if the fallback's hips agree.
 */
export function sanityCheck(xy: Track, opts: SanityOptions = {}): SanityIssue[] {
  const collapse = opts.collapseRatio ?? 0.2;
  const boneRatio = opts.boneRatio ?? 1.4;
  const issues: SanityIssue[] = [];
  const torso = median(torsoLengths(xy));
  if (!(torso > 0)) return issues;

  const p97 = BONES.map((bn) => percentile(xy.map((fr) => hypot2(fr[bn.a], fr[bn.b])), 97));

  xy.forEach((fr, i) => {
    const kneeD = hypot2(fr[LM.leftKnee], fr[LM.rightKnee]);
    const ankleD = hypot2(fr[LM.leftAnkle], fr[LM.rightAnkle]);
    if (kneeD < collapse * torso && ankleD < collapse * torso) {
      issues.push({ frame: i, kind: 'leg-collapse', limbs: ['leftLeg', 'rightLeg'], detail: `knees ${(kneeD / torso).toFixed(2)} ankles ${(ankleD / torso).toFixed(2)} torso` });
    }
    const elbowD = hypot2(fr[LM.leftElbow], fr[LM.rightElbow]);
    const wristD = hypot2(fr[LM.leftWrist], fr[LM.rightWrist]);
    if (elbowD < collapse * torso && wristD < collapse * torso) {
      issues.push({ frame: i, kind: 'arm-collapse', limbs: ['leftArm', 'rightArm'], detail: `elbows ${(elbowD / torso).toFixed(2)} wrists ${(wristD / torso).toFixed(2)} torso` });
    }
    const bad = new Set<Limb>();
    BONES.forEach((bn, k) => {
      const len = hypot2(fr[bn.a], fr[bn.b]);
      if (p97[k] > 0 && len > boneRatio * p97[k]) bad.add(bn.limb);
    });
    if (bad.size) issues.push({ frame: i, kind: 'bone-length', limbs: [...bad] });
  });
  return issues;
}

/** Frames that need the fallback model, deduplicated. */
export function framesToRecheck(issues: SanityIssue[]): number[] {
  return [...new Set(issues.map((i) => i.frame))].sort((a, b) => a - b);
}

/** 0..1 quality for a segment: fraction of frames without sanity issues and with the main joints known. */
export function qualityScore(xy: Track, issues: SanityIssue[]): { score: number; badFrames: number; unknownFrames: number } {
  const n = xy.length || 1;
  const bad = new Set(issues.map((i) => i.frame));
  let unknown = 0;
  const main = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
  for (const fr of xy) if (main.some((j) => Number.isNaN(fr[j][0]))) unknown++;
  const score = Math.max(0, 1 - (bad.size + unknown * 0.5) / n);
  return { score, badFrames: bad.size, unknownFrames: unknown };
}

const LIMB_DISTAL: Record<Limb, number[]> = {
  leftArm: [LM.leftElbow, LM.leftWrist, LM.leftPinky, LM.leftIndex, LM.leftThumb],
  rightArm: [LM.rightElbow, LM.rightWrist, LM.rightPinky, LM.rightIndex, LM.rightThumb],
  leftLeg: [LM.leftKnee, LM.leftAnkle, LM.leftHeel, LM.leftToe],
  rightLeg: [LM.rightKnee, LM.rightAnkle, LM.rightHeel, LM.rightToe],
};

/** Returns a copy of the draw track with the distal joints of implausible limbs set to unknown
 *  (the limb is simply not drawn on those frames; nothing is invented). */
export function hideImplausibleLimbs(xy: Track, issues: SanityIssue[], fps: number): Track {
  const out = xy.map((fr) => fr.map((p) => [p[0], p[1]] as [number, number]));
  const pad = Math.round(fps * 0.1);
  for (const is of issues) {
    if (is.kind !== 'bone-length') continue;
    for (const limb of is.limbs) {
      for (let f = Math.max(0, is.frame - pad); f <= Math.min(out.length - 1, is.frame + pad); f++) {
        for (const j of LIMB_DISTAL[limb]) out[f][j] = [NaN, NaN];
      }
    }
  }
  return out;
}
