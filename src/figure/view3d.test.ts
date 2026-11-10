import { describe, expect, it } from 'vitest';
import { processCapture } from '../pipeline';
import { loadReel } from '../pipeline/__fixtures__/load';
import { clipFromProcessed } from './fromPipeline';
import { downsampleClip, encodeClip, decodeClip } from './codec';
import { decodeWorld, downsampleWorld, encodeWorld } from './codec3d';
import { clipFromView3d, facingRatio, floorPlane, levelFloor } from './view3d';
import type { World } from '../pipeline/floor';
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

  it('yaw 90 turns a frontal body edge-on (synthetic frame)', () => {
    // one frontal frame: shoulders 40 cm apart on the x axis, hips 50 cm below, feet 90 cm below the hips
    const f: [number, number, number][] = Array.from({ length: 33 }, () => [NaN, NaN, NaN]);
    f[LM.leftShoulder] = [0.2, -0.5, 0]; f[LM.rightShoulder] = [-0.2, -0.5, 0]; f[LM.leftHip] = [0.1, 0, 0]; f[LM.rightHip] = [-0.1, 0, 0];
    f[LM.leftAnkle] = [0.1, 0.9, 0]; f[LM.rightAnkle] = [-0.1, 0.9, 0];
    const xy = Array.from({ length: 33 }, () => [NaN, NaN] as [number, number]);
    xy[LM.leftShoulder] = [120, 100]; xy[LM.rightShoulder] = [80, 100]; xy[LM.leftHip] = [110, 200]; xy[LM.rightHip] = [90, 200];
    const c = { fps: 15, xy: [xy], loop: { i0: 0, i1: 0 }, scene: { floor: { a: 0, b: 380 } } } as any;
    const sw = (fr: [number, number][]) => Math.hypot(fr[LM.leftShoulder][0] - fr[LM.rightShoulder][0], fr[LM.leftShoulder][1] - fr[LM.rightShoulder][1]);
    const v0 = clipFromView3d(c, [f] as World, { yawDeg: 0, pxPerMetre: 200 });
    const v90 = clipFromView3d(c, [f] as World, { yawDeg: 90, pxPerMetre: 200 });
    expect(sw(v0.xy[0])).toBeCloseTo(80, 0);
    expect(sw(v90.xy[0])).toBeLessThan(1);
    // the lowest joint (the ankles) rests on the drawn floor
    expect(v0.xy[0][LM.leftAnkle][1]).toBeCloseTo(v0.scene!.floor!.b, 3);
  });

  it('the figure stands above the drawn floor on a real reel', () => {
    const v0 = clipFromView3d(clip, world, { yawDeg: 0 });
    const floor = v0.scene!.floor!.b;
    const feet = v0.xy.map((f) => Math.max(f[LM.leftAnkle][1], f[LM.rightAnkle][1])).filter(Number.isFinite);
    const sorted = feet.sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.9)]).toBeLessThan(floor + 40);
    expect(v0.depth!.legsRightNear.length).toBe(v0.xy.length);
  });
});

describe('3D view levels the floor and grounds the figure', () => {
  const seg = processCapture({ frames: loadReel('reel3_burpee_mp33') })[0];
  const world = downsampleWorld(seg.worldClean, seg.fps, 15).world;
  it('after levelling, the refitted floor plane is flat', () => {
    const before = floorPlane(world);
    const after = floorPlane(levelFloor(world).world);
    expect(before.points).toBeGreaterThan(20);
    expect(Math.abs(before.pitch)).toBeGreaterThan(0.1); // the lab reel is filmed looking down too
    expect(Math.abs(after.pitch)).toBeLessThan(0.06); // ≈ 3°; the lowest-joint set shifts between passes
    expect(Math.abs(after.roll)).toBeLessThan(0.06);
  });
  it('the lowest ground joint sits on the drawn floor in (almost) every frame', () => {
    const clip = decodeClip(encodeClip(downsampleClip(clipFromProcessed(seg), 15)));
    clip.scene = { floor: { a: seg.floor.a, b: seg.floor.b } };
    const v = clipFromView3d(clip, world, { yawDeg: 35 });
    const floor = v.scene!.floor!.b;
    const G = [LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe, LM.leftAnkle, LM.rightAnkle, LM.leftKnee, LM.rightKnee, LM.leftWrist, LM.rightWrist];
    const gaps = v.xy.map((f) => { const ys = G.map((j) => f[j][1]).filter(Number.isFinite); return ys.length ? Math.abs(Math.max(...ys) - floor) : NaN; }).filter(Number.isFinite).sort((a, b) => a - b);
    expect(gaps[gaps.length >> 1]).toBeLessThan(12); // px, at ~250 px per metre: a few cm
  });
});
