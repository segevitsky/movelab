import { describe, expect, it } from 'vitest';
import { clean, toTrack } from '../pipeline/clean';
import { feet } from '../pipeline/feet';
import { framesBetween, loadExpected, loadReel } from '../pipeline/__fixtures__/load';
import { HEAD, prepare, projectToFloor, smoothSeries } from './prepare';

describe('figure prepare()', () => {
  const exp = loadExpected('reel3_burpee_mp33');
  const seg = exp.segments[0];
  const frames = framesBetween(loadReel('reel3_burpee_mp33'), seg.a, seg.b);
  const { xy, conf } = toTrack(frames);
  const cl = clean(xy, conf, exp.fps);
  const clip = { fps: exp.fps, xy: cl, toes: feet(frames, cl, exp.fps, 'toe'), heels: feet(frames, cl, exp.fps, 'heel'), loop: { i0: seg.loop!.i0, i1: seg.loop!.i1 } };

  it('keeps the whole figure inside the viewport with the ground at 87 % height', () => {
    const W = 480, H = 600;
    const prep = prepare(clip, W, H);
    expect(prep.frames).toHaveLength(cl.length);
    expect(prep.loop).toEqual(seg.loop && { i0: seg.loop.i0, i1: seg.loop.i1 });
    let inside = 0;
    prep.frames.forEach((f) => {
      const { x0, y0, scale } = f.cam;
      expect(Math.abs((prep.ground - y0) * scale - 0.87 * H)).toBeLessThan(1e-6);
      const ok = f.p.every((p) => (p[0] - x0) * scale > -W * 0.2 && (p[0] - x0) * scale < W * 1.2 && (p[1] - y0) * scale > -H * 0.2 && (p[1] - y0) * scale < H * 1.2);
      if (ok) inside++;
    });
    expect(inside / prep.frames.length).toBeGreaterThan(0.95);
    // constant scale per clip
    expect(new Set(prep.frames.map((f) => f.cam.scale)).size).toBe(1);
  });

  it('head centre is above the shoulders and steady', () => {
    const prep = prepare(clip, 480, 600);
    let jumps = 0;
    for (let i = 1; i < prep.frames.length; i++) {
      const a = prep.frames[i - 1].p[HEAD];
      const b = prep.frames[i].p[HEAD];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > prep.torso * 0.5) jumps++;
    }
    expect(jumps).toBe(0);
  });

  it('shadow projection lands on the ground line for a point on the ground', () => {
    expect(projectToFloor([10, 100], 100)).toEqual([10, 100]);
    const p = projectToFloor([10, 0], 100);
    expect(p[0]).toBeCloseTo(42);
    expect(p[1]).toBeCloseTo(80);
  });

  it('smoothSeries degrades gracefully on short series', () => {
    expect(smoothSeries([1, 2, 3], 30, 2)).toEqual([1, 2, 3]);
    expect(smoothSeries(Array.from({ length: 100 }, (_, i) => i), 30, 1).map((v) => Math.round(v) + 0)).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });
});
