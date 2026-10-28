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
import { sanityCheck } from './sanity';
import { segment, sliceSegment, type SegmentOptions } from './segment';
import type { FootTrack, LoopResult, PeriodResult, RawPose, SanityIssue, Segment, Track } from './types';

export type ProcessedSegment = {
  segment: Segment;
  fps: number;
  xy: Track;
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
    const cl = clean(xy, conf, fps);
    const period = findPeriod(cl, fps);
    return {
      segment: seg,
      fps,
      xy: cl,
      issues: sanityCheck(cl),
      period,
      loop: period && period.periodic ? bestLoop(cl, period.lag) : null,
      toes: feet(frames, cl, fps, 'toe'),
      heels: feet(frames, cl, fps, 'heel'),
      features: features(cl, fps),
    };
  });
}
