import { describe, expect, it } from 'vitest';
import { clean, toTrack } from './clean';
import { features, poseDistance, topJoints } from './features';
import { framesBetween, loadExpected, loadReel } from './__fixtures__/load';

const HEB: Record<string, string> = { 'מרפק': 'elbow', 'כתף': 'shoulder', 'ירך': 'hip', 'ברך': 'knee' };

describe('features', () => {
  it('top joints match analysis.py on every fixture segment', () => {
    for (const name of ['reel1_mobility_mp33', 'reel2_staff_mp33', 'reel3_burpee_mp33'] as const) {
      const exp = loadExpected(name);
      const raw = loadReel(name);
      for (const seg of exp.segments) {
        const { xy, conf } = toTrack(framesBetween(raw, seg.a, seg.b));
        const tj = topJoints(clean(xy, conf, exp.fps), 2);
        expect(tj.map((j) => `${j.name}:${j.side}`)).toEqual(seg.top_joints.map((j) => `${HEB[j.name]}:${j.side === 0 ? 'R' : 'L'}`));
        tj.forEach((j, k) => expect(j.range).toBeCloseTo(seg.top_joints[k].range, 3));
      }
    }
  });
  it('burpee: hip + elbow are the active joints; start ≠ end pose distance is small for a loop', () => {
    const exp = loadExpected('reel3_burpee_mp33');
    const seg = exp.segments[0];
    const { xy, conf } = toTrack(framesBetween(loadReel('reel3_burpee_mp33'), seg.a, seg.b));
    const cl = clean(xy, conf, exp.fps);
    const f = features(cl, exp.fps);
    expect(f.activeJoints.map((j) => j.name).sort()).toEqual(['elbow', 'hip']);
    expect(f.startPose).toHaveLength(34);
    expect(f.speed).toBeGreaterThan(0);
    const loopXy = cl.slice(seg.loop!.i0, seg.loop!.i1 + 1);
    const lf = features(loopXy, exp.fps);
    expect(poseDistance(lf.startPose, lf.endPose)).toBeLessThan(poseDistance(f.startPose, f.endPose) + 0.5);
  });
});
