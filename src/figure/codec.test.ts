import { describe, expect, it } from 'vitest';
import { clean, toTrack } from '../pipeline/clean';
import { feet } from '../pipeline/feet';
import { framesBetween, loadExpected, loadReel } from '../pipeline/__fixtures__/load';
import { decodeClip, downsampleClip, encodeClip, fromBase64, toBase64 } from './codec';

describe('figure codec', () => {
  const exp = loadExpected('reel3_burpee_mp33');
  const seg = exp.segments[0];
  const frames = framesBetween(loadReel('reel3_burpee_mp33'), seg.a, seg.b);
  const { xy, conf } = toTrack(frames);
  const cl = clean(xy, conf, exp.fps);
  const clip = { fps: exp.fps, xy: cl, toes: feet(frames, cl, exp.fps, 'toe'), heels: feet(frames, cl, exp.fps, 'heel'), loop: { i0: seg.loop!.i0, i1: seg.loop!.i1 } };

  it('round-trips within quarter-pixel precision and keeps feet + loop', () => {
    const bytes = encodeClip(clip);
    const back = decodeClip(bytes);
    expect(back.fps).toBeCloseTo(exp.fps, 4);
    expect(back.xy.length).toBe(cl.length);
    expect(back.loop).toEqual(clip.loop);
    let maxD = 0;
    back.xy.forEach((fr, i) => fr.forEach((p, j) => { maxD = Math.max(maxD, Math.hypot(p[0] - cl[i][j][0], p[1] - cl[i][j][1])); }));
    expect(maxD).toBeLessThanOrEqual(0.25 * Math.SQRT2 + 1e-9);
    back.toes!.xy.forEach((fr, i) => fr.forEach((p, j) => {
      const w = clip.toes.xy[i][j];
      expect(!!p).toBe(!!w);
      if (p && w) expect(Math.hypot(p[0] - w[0], p[1] - w[1])).toBeLessThanOrEqual(0.36);
    }));
  });

  it('15 fps downsample ≈ 2 KB/s as budgeted', () => {
    const ds = downsampleClip(clip, 15);
    expect(ds.fps).toBeCloseTo(exp.fps / 2, 3);
    expect(ds.xy.length).toBe(Math.ceil(cl.length / 2));
    expect(ds.loop!.i0).toBe(Math.floor(seg.loop!.i0 / 2));
    const bytes = encodeClip(ds);
    const seconds = ds.xy.length / ds.fps;
    expect(bytes.length / seconds).toBeLessThan(2600);
  });

  it('base64 round-trips', () => {
    const bytes = encodeClip(downsampleClip(clip, 15));
    const s = toBase64(bytes);
    const back = fromBase64(s);
    expect(back.length).toBe(bytes.length);
    expect(Array.from(back.subarray(0, 64))).toEqual(Array.from(bytes.subarray(0, 64)));
    expect(Array.from(back.subarray(-7))).toEqual(Array.from(bytes.subarray(-7)));
    for (const n of [0, 1, 2, 3, 4, 5]) {
      const b = new Uint8Array(n).map((_, i) => (i * 37) & 255);
      expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b));
    }
  });
});
