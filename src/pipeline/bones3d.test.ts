import { describe, expect, it } from 'vitest';
import { check3dBones, cleanWorld } from './bones3d';
import { metricBoneJump, metricFlagged } from './eval/metrics';
import { framesBetween, loadExpected, loadReel } from './__fixtures__/load';

describe('3D bone-length check', () => {
  const exp = loadExpected('reel3_burpee_mp33');
  const seg = exp.segments[0];
  const frames = framesBetween(loadReel('reel3_burpee_mp33'), seg.a, seg.b);
  const world = frames.map((f) => f.w);
  it('flags a synthetic 40 % leg stretch on exactly those frames, not the neighbours', () => {
    const w2 = world.map((w) => (w ? w.map((p) => [...p] as [number, number, number]) : w));
    const target = [150, 151, 152];
    // stretch the left thigh to 1.4 × its segment-median length (direction kept)
    const lens = world.map((w) => (w ? Math.hypot(w[25][0] - w[23][0], w[25][1] - w[23][1], w[25][2] - w[23][2]) : NaN)).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    const med = lens[Math.floor(lens.length / 2)];
    for (const i of target) {
      const w = w2[i]!;
      const hip = w[23], knee = w[25];
      const v = [knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]];
      const L = Math.hypot(v[0], v[1], v[2]);
      const k = (1.4 * med) / L;
      w[25] = [hip[0] + v[0] * k, hip[1] + v[1] * k, hip[2] + v[2] * k];
    }
    const before = check3dBones(world);
    const after = check3dBones(w2);
    const leftLegFrames = (xs: typeof after) => new Set(xs.filter((i) => i.limbs.includes('leftLeg')).map((i) => i.frame));
    const b = leftLegFrames(before), a = leftLegFrames(after);
    for (const i of target) expect(a.has(i)).toBe(true);
    for (const i of [147, 148, 149, 153, 154, 155]) expect(a.has(i)).toBe(b.has(i));
  });
  it('flags < 5 % of limb-frames on the fixtures, and masking + gap fill brings boneJump near 0', () => {
    for (const name of ['reel1_mobility_mp33', 'reel2_staff_mp33', 'reel3_burpee_mp33'] as const) {
      const e = loadExpected(name);
      for (const s of e.segments) {
        const fr = framesBetween(loadReel(name), s.a, s.b);
        const w = fr.map((f) => f.w);
        const issues = check3dBones(w);
        expect(metricFlagged(issues, w.length).value).toBeLessThan(5);
        const cleaned = cleanWorld(w, e.fps).world;
        const bj = metricBoneJump(cleaned).value;
        expect(bj).toBeLessThan(metricBoneJump(w).value + 1e-9);
        expect(bj).toBeLessThan(0.7); // measured 0.0–0.6 % with 1 s smoothing
      }
    }
  });
});
