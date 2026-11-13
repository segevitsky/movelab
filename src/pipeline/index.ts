export * from './types';
export * from './math';
export { clean, toTrack, torsoLengths, type CleanOptions } from './clean';
export { segment, sliceSegment, type SegmentOptions } from './segment';
export { sanityCheck, framesToRecheck, type SanityOptions } from './sanity';
export { findPeriod, bestLoop, normalise, repCount } from './reps';
export { feet, type FeetOptions } from './feet';
export { hands, FINGERS, PALM, HAND_POINTS, type HandsOptions } from './hands';
export { features, topJoints, jointAngle, poseDistance, JOINT_TRIPLES, type Features } from './features';
export { resample, estimateFps } from './resample';
export { contacts, footContact, type Contacts, type ContactPoint } from './contacts';
export { fitFloor, pinToFloor, floorYAt, type FloorLine } from './floor';
export { oneEuro } from './oneEuro';

import { clean, toTrack, torsoLengths } from './clean';
import { feet } from './feet';
import { hands } from './hands';
import { features, type Features } from './features';
import { bestLoop, findPeriod } from './reps';
import { estimateFps } from './resample';
import { hideImplausibleLimbs, sanityCheck } from './sanity';
import { holdLimbs } from './hold';
import { contacts as detectContacts, type Contacts } from './contacts';
import { fitFloor, pinToFloor, type FloorLine, type World } from './floor';
import { cleanWorld, LIMB_DISTAL_JOINTS } from './bones3d';
import { depthOrder, type DepthOrder } from './depth';
import { median } from './math';
import { segment, sliceSegment, type SegmentOptions } from './segment';
import { trackStaff, type StaffLine, type StaffTrack } from './props/staff';
export { trackStaff, type StaffLine, type StaffTrack } from './props/staff';
import type { FootTrack, HandTrack, LoopResult, PeriodResult, RawPose, SanityIssue, Segment, Track } from './types';

export type ProcessedSegment = {
  segment: Segment;
  fps: number;
  /** cleaned joints for drawing: gaps > 0.5 s stay NaN (never drawn) */
  xy: Track;
  /** cleaned joints with every gap bridged — for reps / features / tagging */
  xyFull: Track;
  /** Phase 2.5: contacts, fitted floor, and the per-frame vertical root-pinning offset applied to xy/xyFull */
  contacts: Contacts;
  floor: FloorLine;
  pinOffset: number[];
  /** Phase 2.5: cleaned 3D world track (flag → mask → fill → smooth) and the depth order per limb pair */
  worldClean: World;
  depth: DepthOrder;
  issues: SanityIssue[];
  period: PeriodResult | null;
  loop: LoopResult | null;
  toes: FootTrack;
  heels: FootTrack;
  /** Phase 17 step 3 (whole-body model only): small toes and 21-point hands */
  smallToes?: FootTrack;
  hands?: HandTrack;
  features: Features;
  /** Phase 16 props: a staff tracked as a rigid rod (only when the capture had line detections) */
  props?: { staff?: { a: StaffTrack['a']; b: StaffTrack['b']; behind: boolean[] } };
};

/** Whole pipeline for one capture: segment → clean → sanity → reps/loop → feet → features. */
export function processCapture(raw: RawPose, opts: { segment?: SegmentOptions; matQuad?: [number, number][]; /** Phase 16: per-frame staff line detections (raw px, capture times) */ staffLines?: StaffLine[] } = {}): ProcessedSegment[] {
  const fps = raw.fps && raw.fps > 0 ? raw.fps : estimateFps(raw.frames);
  return segment(raw.frames, opts.segment).map((seg) => {
    const frames = sliceSegment(raw.frames, seg);
    const { xy, conf } = toTrack(frames);
    // Phase 2.5 step 4: 3D bone-length check first — flagged limb-frames become unknown in 2D too (→ gap fill).
    // Phase 17 (hybrid engine): the 2D points come from the whole-body model and the 3D track from MediaPipe;
    // MediaPipe's 3D failures must not veto joints the other model saw (owner capture 2026-11-10 17:05: the 3D
    // flags blanked good limbs), so the 3D issues only mask the world track there, never the 2D points.
    const hybrid = frames.some((f) => !!f.wb);
    const rawWorld: World = frames.map((f) => (f.w && f.w.length === 33 ? f.w : undefined));
    const w3 = cleanWorld(rawWorld, fps);
    if (!hybrid) for (const is of w3.issues) for (const limb of is.limbs) for (const j of LIMB_DISTAL_JOINTS[limb]) conf[is.frame][j] = 0;
    const full = clean(xy, conf, fps);
    // (the leg/arm "collapse" rule guards against MediaPipe folding two limbs into one; the whole-body model does
    // not fail that way, and knees genuinely together — a pike, a kneeling plank — were flagged every rep)
    const issues = hybrid ? sanityCheck(full, { collapseRatio: 0 }) : [...sanityCheck(full), ...w3.issues];
    const cl = hideImplausibleLimbs(clean(xy, conf, fps, { maxGapSeconds: 1.0 }), issues, fps);
    const period = findPeriod(full, fps);
    const world: World = w3.world;
    const torso = median(torsoLengths(full));
    const contacts = detectContacts(full, fps, torso);
    const floor = fitFloor(full, contacts, { world, matQuad: opts.matQuad });
    const pinned = pinToFloor(full, contacts, floor, fps, { torso, world });
    // Phase 13: short dropouts of a limb keep its last detected pose, carried with its root joint (owner's call)
    const clHeld = holdLimbs(cl, fps, { maxSeconds: 2 }).xy;
    // feet: the raw foot points get the root-pinning offset the cleaned track already has; whole-body model scores
    // between 0.3 and 0.4 are its "not sure" band (two 30 px toe misses on the owner's 11-10 capture, none at 0.4)
    const footOpts = { pinOffset: pinned.offset, ...(hybrid ? { minVisibility: 0.4 } : {}) };
    const clPinned: Track = clHeld.map((fr, i) => fr.map((p) => (Number.isNaN(p[0]) ? p : ([p[0], p[1] + pinned.offset[i]] as [number, number]))));
    let props: ProcessedSegment['props'];
    if (opts.staffLines?.length) {
      const st = trackStaff(opts.staffLines, clPinned, frames.map((f) => f.t), fps, torso, { pinOffset: pinned.offset });
      if (st.L > 0) props = { staff: { a: st.a, b: st.b, behind: st.behind } };
    }
    return {
      props,
      segment: seg,
      fps,
      xy: clPinned,
      xyFull: pinned.xy,
      contacts,
      floor,
      pinOffset: pinned.offset,
      worldClean: w3.world,
      depth: depthOrder(w3.world),
      issues,
      period,
      loop: period && period.periodic ? bestLoop(full, period.lag) : null,
      toes: feet(frames, clPinned, fps, 'toe', footOpts),
      heels: feet(frames, clPinned, fps, 'heel', footOpts),
      smallToes: hybrid ? feet(frames, clPinned, fps, 'smallToe', footOpts) : undefined,
      hands: hybrid ? hands(frames, clPinned, fps, { torso, pinOffset: pinned.offset }) : undefined,
      features: features(full, fps),
    };
  });
}
