import { describe, expect, it } from 'vitest';
import { detectSceneCuts, type SceneDiffSample } from './sceneCuts';

const series = (n: number, fps = 10, base = { hist: 0.04, pix: 4 }): SceneDiffSample[] => Array.from({ length: n }, (_, i) => ({ t: i / fps, ...base }));

describe('visual scene cuts', () => {
  it('finds an isolated spike and reports its time', () => {
    const s = series(100);
    s[46] = { t: 4.6, hist: 0.6, pix: 60 };
    expect(detectSceneCuts(s).map((c) => c.t)).toEqual([4.6]);
  });

  it('ignores a spike that is only large in one measure', () => {
    const s = series(100);
    s[46] = { t: 4.6, hist: 0.6, pix: 6 }; // histogram shifts (lighting) but pixels barely move
    s[70] = { t: 7.0, hist: 0.05, pix: 80 }; // pixels move (fast motion) but the histogram stays
    expect(detectSceneCuts(s)).toEqual([]);
  });

  it('ignores sustained motion (high level, no spike)', () => {
    const s = series(100, 10, { hist: 0.2, pix: 30 });
    s[50] = { t: 5.0, hist: 0.35, pix: 45 };
    expect(detectSceneCuts(s)).toEqual([]);
  });

  it('merges a cut smeared over two samples into one', () => {
    const s = series(100);
    s[46] = { t: 4.6, hist: 0.5, pix: 50 };
    s[47] = { t: 4.7, hist: 0.7, pix: 70 };
    const cuts = detectSceneCuts(s);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].t).toBe(4.7);
  });
});
