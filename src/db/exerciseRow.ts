/** Pure: a processed pipeline segment → a new exercise row (figure codec, loop, poses, scene + fitted floor). */
import type { ProcessedSegment } from '../pipeline';
import { clipFromProcessed } from '../figure/fromPipeline';
import { downsampleClip, encodeClip, toBase64 } from '../figure/codec';
import type { NewExercise } from './schema';

export const newId = (prefix = 'ex') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Store a processed pipeline segment as a new exercise (15 fps figure, loop, poses). */
export function exerciseFromProcessed(seg: ProcessedSegment, fields: Partial<NewExercise> & { name: string }): NewExercise {
  const clip = downsampleClip(clipFromProcessed(seg), 15);
  const now = Date.now();
  // the fitted floor must survive whatever scene the caller passes (Review passes crop/mat/camera): spread
  // `fields` first, then set `scene` — owner fixture DfC8LdUIjV4-float floated because the caller's scene
  // overwrote the floor and the renderer fell back to "lowest ankle + 1.1 torso"
  const scene = { ...(fields.scene ?? { cameraStatic: false }), floor: { a: seg.floor.a, b: seg.floor.b } };
  return {
    id: newId(),
    aliases: [],
    slots: [],
    equipment: [],
    props: [],
    primaryMuscles: [],
    ...fields,
    scene,
    figure: toBase64(encodeClip(clip)),
    figureFps: clip.fps,
    figureFrames: clip.xy.length,
    loopStart: clip.loop?.i0 ?? null,
    loopEnd: clip.loop?.i1 ?? null,
    repSeconds: seg.period?.periodic ? seg.period.period : null,
    startPose: seg.features.startPose,
    endPose: seg.features.endPose,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
}

