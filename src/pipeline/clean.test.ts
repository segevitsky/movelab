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

describe('clean() with maxGapSeconds', () => {
  it('leaves long gaps and never-seen joints unknown, bridges short ones', () => {
    const raw = loadReel('reel3_burpee_mp33');
    const frames = raw.filter((f) => f.t >= 0.6 && f.t <= 12.6333);
    const { xy, conf } = toTrack(frames);
    // hide the left wrist for 1.2 s in the middle, and the right pinky everywhere
    const fps = 30;
    for (let i = 100; i < 100 + 36; i++) conf[i][15] = 0;
    for (let i = 0; i < conf.length; i++) conf[i][18] = 0;
    // and a short 6-frame gap on the left ankle
    for (let i = 200; i < 206; i++) conf[i][27] = 0;
    const cl = clean(xy, conf, fps, { maxGapSeconds: 0.5 });
    expect(Number.isNaN(cl[110][15][0])).toBe(true); // inside the long gap
    expect(Number.isNaN(cl[90][15][0])).toBe(false); // before it
    expect(cl.every((f) => Number.isNaN(f[18][0]))).toBe(true); // never seen → never drawn
    expect(Number.isNaN(cl[203][27][0])).toBe(false); // short gap bridged
    const bridged = clean(xy, conf, fps);
    expect(Number.isNaN(bridged[110][15][0])).toBe(false); // default behaviour unchanged
  });
});
