import { jointAngle } from '../pipeline/features';
import type { ProcessedSegment } from '../pipeline';
import { smoothSeries, type FigureClip } from './prepare';

/** Build a renderable clip from a processed pipeline segment (loop window + HUD angles included). */
export function clipFromProcessed(seg: ProcessedSegment): FigureClip {
  const hud = seg.features.activeJoints.map((j) => ({
    name: `${j.name} ${j.side}`,
    angles: smoothSeries(jointAngle(seg.xyFull, j.tri[0], j.tri[1], j.tri[2]), seg.fps, 0.8),
  }));
  return {
    fps: seg.fps,
    xy: seg.xy,
    toes: seg.toes,
    heels: seg.heels,
    loop: seg.loop ? { i0: seg.loop.i0, i1: seg.loop.i1 } : undefined,
    hud,
    scene: { floor: { a: seg.floor.a, b: seg.floor.b } },
    debug: { contacts: seg.contacts, flagged: seg.issues.filter((i) => i.kind === 'bone-length').map((i) => ({ frame: i.frame, limbs: i.limbs })) },
  };
}
