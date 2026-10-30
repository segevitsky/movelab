/** Runs the current pipeline on a fixture and computes the Phase 2.5 metrics per segment (pure). */
import { processCapture, type ProcessedSegment, type RawFrame } from '../index';
import { LM } from '../types';
import { percentile } from '../math';
import { metricBoneJump, metricDepthFlips, metricFlagged, metricFloat, metricSkate, nearSideRaw, torsoOf, type Contacts, type FloorLine, type Metrics, type World } from './metrics';
import { naiveContacts } from './naiveContacts';
import { contacts as realContacts } from '../contacts';

export type EvalHooks = {
  /** contact detector (default: step-2 `contacts()`; `naive: true` → the step-1 proxy) */
  contacts?: (seg: ProcessedSegment, world: World, torso: number) => Contacts;
  /** floor estimate (default: step-3 fitted floor; `stage: 'step2'` → horizontal baseline line) */
  floor?: (seg: ProcessedSegment, contacts: Contacts, torso: number) => FloorLine;
  /** depth series (default: raw world z of knees / elbows, no smoothing) */
  depth?: (seg: ProcessedSegment, world: World) => { legs: (boolean | null)[]; arms: (boolean | null)[] };
};

export function worldOf(frames: RawFrame[], seg: ProcessedSegment): World {
  return frames.slice(seg.segment.start, seg.segment.end + 1).map((f) => (f.w && f.w.length === 33 ? f.w : undefined));
}

export function baselineFloor(seg: ProcessedSegment): FloorLine {
  const ys = seg.xyFull.map((f) => Math.max(f[LM.leftAnkle][1], f[LM.rightAnkle][1]));
  return { a: 0, b: percentile(ys, 97) };
}

export type SegmentEval = { label: string; t0: number; t1: number; metrics: Metrics };

export type EvalStage = 'baseline' | 'step2' | 'step3';
export function evalFixture(frames: RawFrame[], hooks: EvalHooks = {}, opts: { naive?: boolean; stage?: EvalStage } = {}): SegmentEval[] {
  const segs = processCapture({ frames });
  return segs.map((seg, i) => {
    const world = worldOf(frames, seg);
    const torso = torsoOf(seg.xyFull);
    const stage: EvalStage = opts.stage ?? (opts.naive ? 'baseline' : 'step3');
    // the pipeline now pins the figure itself; earlier stages are evaluated on the un-pinned track
    const unpinned = seg.xyFull.map((fr, i) => fr.map((p) => (Number.isNaN(p[0]) ? p : ([p[0], p[1] - seg.pinOffset[i]] as [number, number]))));
    const contacts = hooks.contacts ? hooks.contacts(seg, world, torso) : stage === 'baseline' ? naiveContacts(unpinned, seg.fps, torso) : seg.contacts;
    let track = stage === 'step3' ? seg.xyFull : unpinned;
    let floor: FloorLine;
    if (hooks.floor) floor = hooks.floor(seg, contacts, torso);
    else if (stage === 'step3') floor = seg.floor;
    else floor = baselineFloor({ ...seg, xyFull: unpinned });
    const depth = hooks.depth ? hooks.depth(seg, world) : { legs: nearSideRaw(world, 'legs'), arms: nearSideRaw(world, 'arms') };
    const fl = metricFloat(track, contacts, floor, torso, stage === 'step3' ? world : undefined);
    const sk = metricSkate(track, contacts, torso);
    const bj = metricBoneJump(world);
    const fg = metricFlagged(seg.issues, seg.xyFull.length);
    const df = metricDepthFlips(depth.legs, depth.arms, seg.fps);
    const contactFrames = Object.values(contacts).reduce((s, arr) => s + arr.filter(Boolean).length, 0);
    return { label: `seg ${i + 1}`, t0: seg.segment.t0, t1: seg.segment.t1, metrics: { float: fl.value, skate: sk.value, boneJump: bj.value, flagged: fg.value, depthFlips: df.value, frames: seg.xyFull.length, contactFrames } };
  });
}
