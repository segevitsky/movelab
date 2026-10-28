import { describe, expect, it } from 'vitest';
import { clean, toTrack } from './clean';
import { bestLoop, findPeriod } from './reps';
import { framesBetween, loadExpected, loadReel } from './__fixtures__/load';

describe('reps: period by pose autocorrelation + seamless loop', () => {
  it('reel 3 from 0.6 s → period 5.2 ± 0.2 s, periodic; loop ≈ 2.2–7.4 s', () => {
    const exp = loadExpected('reel3_burpee_mp33');
    const seg = exp.segments[0];
    const frames = framesBetween(loadReel('reel3_burpee_mp33'), seg.a, seg.b);
    const { xy, conf } = toTrack(frames);
    const cl = clean(xy, conf, exp.fps);
    const p = findPeriod(cl, exp.fps)!;
    expect(p).not.toBeNull();
    expect(p.periodic).toBe(true);
    expect(Math.abs(p.period - 5.2)).toBeLessThan(0.2);
    expect(p.lag).toBe(seg.period!.lag);
    expect(p.score).toBeCloseTo(seg.period!.score, 6);
    const loop = bestLoop(cl, p.lag);
    expect(loop.i0).toBe(seg.loop!.i0);
    expect(loop.i1).toBe(seg.loop!.i1);
    expect(frames[loop.i0].t).toBeCloseTo(2.17, 1);
    expect(frames[loop.i1].t).toBeCloseTo(7.4, 1);
    expect(loop.err).toBeCloseTo(seg.loop!.err, 6);
  });
  it('reel 2 (staff flow) → not periodic', () => {
    const exp = loadExpected('reel2_staff_mp33');
    const seg = exp.segments[0];
    const frames = framesBetween(loadReel('reel2_staff_mp33'), seg.a, seg.b);
    const { xy, conf } = toTrack(frames);
    const p = findPeriod(clean(xy, conf, exp.fps), exp.fps)!;
    expect(p.periodic).toBe(false);
    expect(p.lag).toBe(seg.period!.lag);
    expect(p.score).toBeCloseTo(seg.period!.score, 6);
  });
});
