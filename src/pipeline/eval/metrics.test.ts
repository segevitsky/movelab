import { describe, expect, it } from 'vitest';
import { flipsPerSecond, metricBoneJump, metricFlagged, metricFloat, metricSkate, type Contacts, type World } from './metrics';
import { LM, type Track } from '../types';

const blank = (n: number): Contacts => ({ heelL: Array(n).fill(false), heelR: Array(n).fill(false), toeL: Array(n).fill(false), toeR: Array(n).fill(false), handL: Array(n).fill(false), handR: Array(n).fill(false) });
const frame = (y: number, x = 100): Track[number] => Array.from({ length: 33 }, () => [x, y] as [number, number]);

describe('plausibility metrics', () => {
  it('float = distance of contact points to the floor, in torso units', () => {
    const xy: Track = [frame(100), frame(110), frame(120)];
    const c = blank(3); c.heelL = [true, true, true];
    expect(metricFloat(xy, c, { a: 0, b: 100 }, 50).value).toBeCloseTo((0 + 10 + 20) / 3 / 50);
    expect(metricFloat(xy, blank(3), { a: 0, b: 100 }, 50).n).toBe(0);
  });
  it('skate = per-frame displacement while in contact', () => {
    const xy: Track = [frame(100, 0), frame(100, 5), frame(100, 5), frame(100, 50)];
    const c = blank(4); c.toeR = [true, true, true, false];
    expect(metricSkate(xy, c, 10).value).toBeCloseTo((0.5 + 0) / 2);
  });
  it('boneJump counts > 20 % 3D length changes', () => {
    const w = (len: number) => { const a = Array.from({ length: 33 }, () => [0, 0, 0]); a[LM.leftKnee] = [len, 0, 0]; return a as [number, number, number][]; };
    const world: World = [w(0.4), w(0.41), w(0.6), w(0.6)];
    // only the left thigh (hip→knee) changes; other bones are 0-length → skipped (prev > 0 guard)
    expect(metricBoneJump(world).value).toBeCloseTo((100 * 1) / 3);
  });
  it('flagged = % limb-frames', () => {
    expect(metricFlagged([{ frame: 0, kind: 'bone-length', limbs: ['leftLeg', 'rightLeg'] }, { frame: 0, kind: 'leg-collapse', limbs: ['leftLeg', 'rightLeg'] }], 10).value).toBeCloseTo(5);
  });
  it('flipsPerSecond', () => {
    expect(flipsPerSecond([true, true, false, false, true, null, true], 30)).toBeCloseTo(2 / (6 / 30));
  });
});
