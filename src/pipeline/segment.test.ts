import { describe, expect, it } from 'vitest';
import { segment } from './segment';
import { loadPhoneReel, loadReel } from './__fixtures__/load';

describe('segment() by pose discontinuity', () => {
  it('reel 1 (3 moves with hard cuts) → 3 segments ≈ [0–3.2], [3.2–13], [13–28]', () => {
    const segs = segment(loadReel('reel1_mobility_mp33'));
    expect(segs.map((s) => [s.t0, s.t1, s.cutReason])).toMatchSnapshot();
    expect(segs).toHaveLength(3);
    expect(segs[0].t0).toBeLessThan(0.2);
    expect(segs[0].t1).toBeCloseTo(3.2, 0);
    expect(segs[1].t0).toBeCloseTo(3.2, 0);
    expect(segs[1].t1).toBeCloseTo(13.0, 0);
    expect(segs[2].t0).toBeCloseTo(13.0, 0);
    expect(segs[2].t1).toBeGreaterThan(27.3);
  });
  it('reel 2 (continuous staff flow, fast spins) → one segment', () => {
    const segs = segment(loadReel('reel2_staff_mp33'));
    expect(segs).toHaveLength(1);
    expect(segs[0].t0).toBeLessThan(0.1);
    expect(segs[0].t1).toBeGreaterThan(27);
  });
  it('reel 3 (burpee-lunge, caption at the start) → main segment starts after the caption', () => {
    const segs = segment(loadReel('reel3_burpee_mp33'));
    expect(segs.length).toBeGreaterThanOrEqual(1);
    const main = segs.reduce((a, b) => (b.t1 - b.t0 > a.t1 - a.t0 ? b : a));
    expect(main.t0).toBeGreaterThan(0.4);
    expect(main.t0).toBeLessThan(0.8);
    expect(main.t1).toBeGreaterThan(11.5);
  });
  it('external scene cuts are honoured', () => {
    const segs = segment(loadReel('reel2_staff_mp33'), { cutTimes: [10.0], externalOnly: true });
    expect(segs).toHaveLength(2);
    expect(segs[0].cutReason).toBe('external');
    expect(segs[0].t1).toBeLessThanOrEqual(10.0);
    expect(segs[1].t0).toBeGreaterThanOrEqual(10.0);
  });
  it('phone capture (one reel, variable fps) → one segment', () => {
    const segs = segment(loadPhoneReel());
    expect(segs).toHaveLength(1);
  });
});
