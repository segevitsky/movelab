import { describe, expect, it } from 'vitest';
import { clean, toTrack } from './clean';
import { MP2COCO } from './types';
import { framesBetween, loadExpected, loadReel } from './__fixtures__/load';

const REELS = ['reel1_mobility_mp33', 'reel2_staff_mp33', 'reel3_burpee_mp33'] as const;

describe('clean() matches the Python reference (proc.py) on the COCO-17 subset', () => {
  for (const name of REELS) {
    const raw = loadReel(name);
    const exp = loadExpected(name);
    for (const seg of exp.segments) {
      it(`${name} [${seg.a}–${seg.b}] within 2 px RMS`, () => {
        const frames = framesBetween(raw, seg.a, seg.b);
        expect(frames.length).toBe(seg.t.length);
        const { xy, conf } = toTrack(frames);
        const cl = clean(xy, conf, exp.fps);
        let se = 0;
        let cnt = 0;
        let maxD = 0;
        cl.forEach((fr, i) => {
          MP2COCO.forEach((j, c) => {
            const d = Math.hypot(fr[j][0] - seg.clean_xy[i][c][0], fr[j][1] - seg.clean_xy[i][c][1]);
            se += d * d;
            cnt++;
            if (d > maxD) maxD = d;
          });
        });
        const rms = Math.sqrt(se / cnt);
        expect(rms).toBeLessThan(2);
        // the port is meant to be exact: anything above rounding noise (golden has 3 decimals) is a bug
        expect(maxD).toBeLessThan(0.05);
      });
    }
  }
});
