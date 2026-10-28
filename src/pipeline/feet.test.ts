import { describe, expect, it } from 'vitest';
import { clean, toTrack } from './clean';
import { feet } from './feet';
import { framesBetween, loadExpected, loadReel } from './__fixtures__/load';

describe('feet(): heel/toe relative to the shin, matches feetproc.py', () => {
  const exp = loadExpected('reel3_burpee_mp33');
  const seg = exp.segments[0];
  const frames = framesBetween(loadReel('reel3_burpee_mp33'), seg.a, seg.b);
  const { xy, conf } = toTrack(frames);
  const cl = clean(xy, conf, exp.fps);
  for (const key of ['toe', 'heel'] as const) {
    it(key, () => {
      const got = feet(frames, cl, exp.fps, key);
      const want = seg[`feet_${key}`]!;
      let maxD = 0;
      let n = 0;
      got.xy.forEach((fr, i) => {
        fr.forEach((p, j) => {
          const w = want.xy[i][j];
          expect(got.ok[i][j]).toBe(want.ok[i][j] === 1);
          if (p && w) { maxD = Math.max(maxD, Math.hypot(p[0] - w[0], p[1] - w[1])); n++; }
          else expect(p === null).toBe(w === null);
        });
      });
      expect(n).toBeGreaterThan(300);
      expect(maxD).toBeLessThan(0.05);
    });
  }
});
