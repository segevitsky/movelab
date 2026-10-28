import { describe, expect, it } from 'vitest';
import { processCapture } from './index';
import { resample, estimateFps } from './resample';
import { sanityCheck } from './sanity';
import { loadPhoneReel, loadReel } from './__fixtures__/load';

describe('end to end', () => {
  it('reel 1 → 3 processed segments with features, no crash', () => {
    const out = processCapture({ frames: loadReel('reel1_mobility_mp33') });
    expect(out).toHaveLength(3);
    for (const s of out) {
      expect(s.xy.length).toBe(s.segment.end - s.segment.start + 1);
      expect(s.features.activeJoints).toHaveLength(2);
    }
  });
  it('reel 3 → periodic with a loop', () => {
    const out = processCapture({ frames: loadReel('reel3_burpee_mp33') });
    const main = out.reduce((a, b) => (b.xy.length > a.xy.length ? b : a));
    expect(main.period?.periodic).toBe(true);
    expect(main.loop).not.toBeNull();
    expect(Math.abs(main.period!.period - 5.2)).toBeLessThan(0.25);
  });
  it('phone capture (39 fps variable) → resample to 30 fps, then process', () => {
    const raw = loadPhoneReel();
    const fpsRaw = estimateFps(raw);
    expect(fpsRaw).toBeGreaterThan(30.5); // ReplayKit: nominal 39 fps, median interval ≈ 1/31.6 s, irregular
    const rs = resample(raw, 30);
    expect(Math.abs(estimateFps(rs) - 30)).toBeLessThan(0.01);
    expect(rs.length).toBeLessThan(raw.length);
    const out = processCapture({ fps: 30, frames: rs });
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].features.activeJoints.length).toBe(2);
  });
  it('sanity check flags nothing on a clean staff flow and something on a collapsed frame', () => {
    const out = processCapture({ frames: loadReel('reel2_staff_mp33') });
    const xy = out[0].xy;
    const legIssues = sanityCheck(xy).filter((i) => i.kind === 'leg-collapse');
    expect(legIssues.length).toBeLessThan(xy.length * 0.05);
    // collapse both legs onto one in frame 10
    const bad = xy.map((fr) => fr.map((p) => [p[0], p[1]] as [number, number]));
    bad[10][26] = bad[10][25];
    bad[10][28] = bad[10][27];
    expect(sanityCheck(bad).some((i) => i.frame === 10 && i.kind === 'leg-collapse')).toBe(true);
  });
});
