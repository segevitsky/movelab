export * from './types';
export * from './math';
export { clean, toTrack, torsoLengths, type CleanOptions } from './clean';
export { segment, sliceSegment, type SegmentOptions } from './segment';
export { sanityCheck, framesToRecheck, type SanityOptions } from './sanity';
export { findPeriod, bestLoop, normalise, repCount } from './reps';
export { feet, type FeetOptions } from './feet';
export { features, topJoints, jointAngle, poseDistance, JOINT_TRIPLES, type Features } from './features';
export { resample, estimateFps } from './resample';

import { clean, toTrack } from './clean';
import { feet } from './feet';
import { features, type Features } from './features';
import { bestLoop, findPeriod } from './reps';
import { estimateFps } from './resample';
import { hideImplausibleLimbs, sanityCheck } from './sanity';
import { segment, sliceSegment, type SegmentOptions } from './segment';
import type { FootTrack, LoopResult, PeriodResult, RawPose, SanityIssue, Segment, Track } from './types';

export type ProcessedSegment = {
  segment: Segment;
  fps: number;
  /** cleaned joints for drawing: gaps > 0.5 s stay NaN (never drawn) */
  xy: Track;
  /** cleaned joints with every gap bridged — for reps / features / tagging */
  xyFull: Track;
  issues: SanityIssue[];
  period: PeriodResult | null;
  loop: LoopResult | null;
  toes: FootTrack;
  heels: FootTrack;
  features: Features;
};

/** Whole pipeline for one capture: segment → clean → sanity → reps/loop → feet → features. */
export function processCapture(raw: RawPose, opts: { segment?: SegmentOptions } = {}): ProcessedSegment[] {
  const fps = raw.fps && raw.fps > 0 ? raw.fps : estimateFps(raw.frames);
  return segment(raw.frames, opts.segment).map((seg) => {
    const frames = sliceSegment(raw.frames, seg);
    const { xy, conf } = toTrack(frames);
    const full = clean(xy, conf, fps);
    const issues = sanityCheck(full);
    const cl = hideImplausibleLimbs(clean(xy, conf, fps, { maxGapSeconds: 1.0 }), issues, fps);
    const period = findPeriod(full, fps);
    return {
      segment: seg,
      fps,
      xy: cl,
      xyFull: full,
      issues,
      period,
      loop: period && period.periodic ? bestLoop(full, period.lag) : null,
      toes: feet(frames, cl, fps, 'toe'),
      heels: feet(frames, cl, fps, 'heel'),
      features: features(full, fps),
    };
  });
}
