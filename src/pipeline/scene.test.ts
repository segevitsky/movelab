import { describe, expect, it } from 'vitest';
import { clean, toTrack } from './clean';
import { framesBetween, loadExpected, loadReel } from './__fixtures__/load';
import { validateMatQuad } from './scene';
import { LM } from './types';
import { median, percentile } from './math';

describe('validateMatQuad', () => {
  const exp = loadExpected('reel3_burpee_mp33');
  const seg = exp.segments[0];
  const { xy, conf } = toTrack(framesBetween(loadReel('reel3_burpee_mp33'), seg.a, seg.b));
  const cl = clean(xy, conf, exp.fps);
  const ground = percentile(cl.map((f) => Math.max(f[LM.leftAnkle][1], f[LM.rightAnkle][1])), 97);
  const hipY = median(cl.map((f) => (f[LM.leftHip][1] + f[LM.rightHip][1]) / 2));
  it('rejects a wall-sized quad covering the whole frame', () => {
    expect(validateMatQuad([[0, 0], [500, 0], [500, 900], [0, 900]], cl)).toBeUndefined();
  });
  it('accepts a floor patch under the figure', () => {
    const q: [number, number][] = [[100, hipY + 10], [400, hipY + 10], [450, ground + 20], [50, ground + 20]];
    expect(validateMatQuad(q, cl)).toBeDefined();
  });
  it('rejects a quad above the hips or a narrow sliver', () => {
    expect(validateMatQuad([[100, hipY - 200], [400, hipY - 200], [400, ground], [100, ground]], cl)).toBeUndefined();
    expect(validateMatQuad([[200, hipY + 10], [210, hipY + 10], [210, ground + 10], [200, ground + 10]], cl)).toBeUndefined();
  });
});
