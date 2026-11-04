import { describe, expect, it } from 'vitest';
import { processCapture } from '../pipeline';
import { loadReel } from '../pipeline/__fixtures__/load';
import { clipFromProcessed } from './fromPipeline';
import { downsampleClip, encodeClip, decodeClip } from './codec';
import { decodeWorld, downsampleWorld, encodeWorld } from './codec3d';
import { clipFromView3d, facingRatio } from './view3d';
import { LM } from '../pipeline/types';

describe('3D track codec', () => {
  it('round-trips the cleaned world track at mm precision and keeps frames aligned with the 2D clip', () => {
    const seg = processCapture({ frames: loadReel('reel3_burpee_mp33') })[0];
    const clip = downsampleClip(clipFromProcessed(seg), 15);
    const w = downsampleWorld(seg.worldClean, seg.fps, 15);
    expect(w.world.length).toBe(clip.xy.length);
    const back = decodeWorld(encodeWorld(w.world, w.fps));
    expect(back.fps).toBeCloseTo(w.fps, 3);
    expect(back.world.length).toBe(w.world.length);
    const i = w.world.findIndex((f) => !!f);
    expect(back.world[i]![LM.leftKnee][0]).toBeCloseTo(w.world[i]![LM.leftKnee][0], 3);
    expect(back.world[i]![LM.leftKnee][2]).toBeCloseTo(w.world[i]![LM.leftKnee][2], 3);
  });
});

describe('3D view', () => {
  const seg = processCapture({ frames: loadReel('reel3_burpee_mp33') })[0];
  const clip = decodeClip(encodeClip(downsampleClip(clipFromProcessed(seg), 15)));
  clip.scene = { floor: { a: seg.floor.a, b: seg.floor.b } };
  const world = downsampleWorld(seg.worldClean, seg.fps, 15).world;

  it('facing ratio is a number in a sane range for a side-ish reel', () => {
    const r = facingRatio(clip.xy, world);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1.6);
  });

  it('yaw 0 keeps the body proportions; yaw 90 turns the shoulders edge-on', () => {
    const v0 = clipFromView3d(clip, world, { yawDeg: 0 });
    const v90 = clipFromView3d(clip, world, { yawDeg: 90 });
    const i = v0.xy.findIndex((f) => Number.isFinite(f[LM.leftShoulder][0]) && Number.isFinite(f[LM.rightShoulder][0]));
    const sw = (f: [number, number][]) => Math.hypot(f[LM.leftShoulder][0] - f[LM.rightShoulder][0], f[LM.leftShoulder][1] - f[LM.rightShoulder][1]);
    expect(sw(v0.xy[i])).toBeGreaterThan(sw(v90.xy[i]) * 1.5);
    // the figure stands above the drawn floor (image y of the feet ≤ floor + a little)
    const floor = v0.scene!.floor!.b;
    const feet = v0.xy.map((f) => Math.max(f[LM.leftAnkle][1], f[LM.rightAnkle][1])).filter(Number.isFinite);
    const sorted = feet.sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.9)]).toBeLessThan(floor + 40);
    expect(v0.depth!.legsRightNear.length).toBe(v0.xy.length);
  });
});
