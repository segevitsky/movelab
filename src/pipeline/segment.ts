import { hypot2, isNum, mean } from './math';
import { LM, MP2COCO, type RawFrame, type Segment, type XY } from './types';

export type SegmentOptions = {
  /** hip-centre jump between consecutive detected frames, in torso lengths, that marks a cut */
  hipJump?: number; // 1.0
  /** mean normalised-joint displacement (torso units) that marks a cut on its own */
  poseJump?: number; // 2.0
  /** a run of frames without a person longer than this (seconds) is a cut */
  gapSeconds?: number; // 0.5
  /** segments shorter than this are dropped (caption transitions, outros); reel 1's outro is 1.3 s */
  minSeconds?: number; // 1.5
  /** extra cut times (e.g. scene-cut scores from the native decoder), seconds */
  cutTimes?: number[];
  /** only cut on external cutTimes, never on pose discontinuity */
  externalOnly?: boolean;
  /** a jump that comes back to the previous pose within this many seconds is a glitch, not a cut */
  returnSeconds?: number; // 0.5
};

function hipCentre(xy: XY[]): XY {
  return [(xy[LM.leftHip][0] + xy[LM.rightHip][0]) / 2, (xy[LM.leftHip][1] + xy[LM.rightHip][1]) / 2];
}
function shoulderCentre(xy: XY[]): XY {
  return [(xy[LM.leftShoulder][0] + xy[LM.rightShoulder][0]) / 2, (xy[LM.leftShoulder][1] + xy[LM.rightShoulder][1]) / 2];
}

/**
 * Split a capture into exercises using pose discontinuity (and optional external scene cuts).
 * Rationale (measured on the 3 lab reels): hard cuts move the hip centre by 2–5 torso lengths between
 * consecutive frames; the fastest continuous motion (staff spins) stays below 0.35. Frames without a
 * person at the start/end are never part of a segment.
 */
export function segment(frames: RawFrame[], opts: SegmentOptions = {}): Segment[] {
  const hipJumpThr = opts.hipJump ?? 1.0;
  const poseJumpThr = opts.poseJump ?? 2.0;
  const gapSec = opts.gapSeconds ?? 0.5;
  const minSec = opts.minSeconds ?? 1.5;
  const cutTimes = (opts.cutTimes ?? []).slice().sort((a, b) => a - b);

  const detected: number[] = [];
  for (let i = 0; i < frames.length; i++) if (frames[i].xy && frames[i].xy!.length === 33) detected.push(i);
  if (detected.length === 0) return [];

  // normalised pose per detected frame (COCO subset, hip-centred, / torso)
  const norm = new Map<number, { hip: XY; torso: number; vec: number[] }>();
  for (const i of detected) {
    const xy = frames[i].xy!;
    const hip = hipCentre(xy);
    const torso = hypot2(shoulderCentre(xy), hip) || 1e-6;
    const vec: number[] = [];
    for (const j of MP2COCO) vec.push((xy[j][0] - hip[0]) / torso, (xy[j][1] - hip[1]) / torso);
    norm.set(i, { hip, torso, vec });
  }

  const segs: Segment[] = [];
  let start = detected[0];
  let cutIdx = 0;
  const close = (end: number, reason: Segment['cutReason']) => {
    segs.push({ start, end, t0: frames[start].t, t1: frames[end].t, cutReason: reason });
  };

  // distance between two detected frames: hip centre (torso units) and mean joint displacement
  const dist = (i: number, j: number) => {
    const a = norm.get(i)!, b = norm.get(j)!;
    const hip = hypot2(a.hip, b.hip) / b.torso;
    const d: number[] = [];
    for (let q = 0; q < a.vec.length; q += 2) { const dx = a.vec[q] - b.vec[q], dy = a.vec[q + 1] - b.vec[q + 1]; d.push(Math.sqrt(dx * dx + dy * dy)); }
    return { hip, pose: mean(d) };
  };
  const jumped = ({ hip, pose }: { hip: number; pose: number }) => hip > hipJumpThr || (isNum(pose) && pose > poseJumpThr);
  // a jump that comes straight back (within `returnSec`) is the model losing the body for a few frames, not a
  // new exercise (owner fixture DfWjXHKuRpu-lying: one periodic drill was cut into three)
  const returnSec = opts.returnSeconds ?? 0.5;
  // does the pose come back to `ref` within returnSec after index k? (then frames in between are glitches)
  const returns = (ref: number, k: number) => {
    for (let m = k; m < detected.length && frames[detected[m]].t - frames[ref].t <= returnSec; m++) if (!jumped(dist(ref, detected[m]))) return true;
    return false;
  };

  let ref = detected[0]; // the last trusted frame; glitch frames never become the reference
  for (let k = 1; k < detected.length; k++) {
    const prev = detected[k - 1];
    const cur = detected[k];
    const tPrev = frames[prev].t;
    const tCur = frames[cur].t;
    let reason: Segment['cutReason'] | null = null;

    while (cutIdx < cutTimes.length && cutTimes[cutIdx] <= tPrev) cutIdx++;
    if (cutIdx < cutTimes.length && cutTimes[cutIdx] > tPrev && cutTimes[cutIdx] <= tCur) {
      // a picture change with the same pose on both sides is a flash or an overlay, not an edit
      reason = jumped(dist(ref, cur)) || opts.externalOnly ? 'external' : null;
    }

    if (!reason && tCur - tPrev > gapSec) reason = 'gap';

    let glitch = false;
    if (!reason && !opts.externalOnly) {
      const { hip, pose } = dist(ref, cur);
      if (jumped({ hip, pose })) {
        if (returns(ref, k)) glitch = true;
        else reason = hip > hipJumpThr ? 'hip-jump' : 'pose-jump';
      }
    }

    if (reason) {
      close(prev, reason);
      start = cur;
    }
    if (!glitch) ref = cur;
  }
  close(detected[detected.length - 1], 'end');

  return segs.filter((s) => s.t1 - s.t0 >= minSec);
}

/** Frames of one segment (inclusive range). */
export function sliceSegment(frames: RawFrame[], s: Segment): RawFrame[] {
  return frames.slice(s.start, s.end + 1);
}
