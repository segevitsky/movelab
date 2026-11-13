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

describe('codec: staff prop (Phase 16)', () => {
  it('round-trips the rod ends and the behind flag, and survives downsampling', async () => {
    const { encodeClip, decodeClip, downsampleClip } = await import('./codec');
    const n = 6;
    const xy = Array.from({ length: n }, () => Array.from({ length: 33 }, () => [10, 20] as [number, number]));
    const clip = { fps: 30, xy, loop: { i0: 0, i1: n - 1 }, props: { staff: { a: xy.map((_, i) => (i === 2 ? null : [i * 10, 5] as [number, number])), b: xy.map((_, i) => (i === 2 ? null : [i * 10 + 100, 50] as [number, number])), behind: xy.map((_, i) => i % 2 === 0) } } };
    const back = decodeClip(encodeClip(clip as any));
    expect(back.props?.staff?.a[1]).toEqual([10, 5]);
    expect(back.props?.staff?.a[2]).toBeNull();
    expect(back.props?.staff?.behind).toEqual([true, false, true, false, true, false]);
    const half = downsampleClip(clip as any, 15);
    expect(half.props?.staff?.a.length).toBe(3);
    expect(half.props?.staff?.a[1]).toBeNull();
  });
});

describe('codec: hands + small toes (Phase 17 step 3)', () => {
  it('round-trips 21-point hands and small toes, nulls included, and survives downsampling', () => {
    const n = 6;
    const xy = Array.from({ length: n }, () => Array.from({ length: 33 }, () => [10, 20] as [number, number]));
    const hand = (i: number) => Array.from({ length: 21 }, (_, j) => (j === 4 ? null : ([i * 10 + j, 100 + j] as [number, number])));
    const clip = {
      fps: 30, xy, loop: { i0: 0, i1: n - 1 },
      hands: { xy: xy.map((_, i) => [i === 2 ? null : hand(i), hand(i)]), ok: xy.map(() => [true, false] as [boolean, boolean]) },
      smallToes: { xy: xy.map((_, i) => [i === 1 ? null : ([i, 7] as [number, number]), [i + 50, 9] as [number, number]]), ok: xy.map(() => [true, true] as [boolean, boolean]) },
    };
    const back = decodeClip(encodeClip(clip as any));
    expect(back.hands!.xy[0][0]![3]).toEqual([3, 103]);
    expect(back.hands!.xy[0][0]![4]).toBeNull();
    expect(back.hands!.xy[2][0]).toBeNull();
    expect(back.hands!.xy[2][1]![0]).toEqual([20, 100]);
    expect(back.smallToes!.xy[1][0]).toBeNull();
    expect(back.smallToes!.xy[3]).toEqual([[3, 7], [53, 9]]);
    const half = downsampleClip(clip as any, 15);
    expect(half.hands!.xy.length).toBe(3);
    expect(half.hands!.xy[1][0]).toBeNull();
    expect(half.smallToes!.xy[2][0]).toEqual([4, 7]);
  });
});
