import { describe, expect, it } from 'vitest';
import { holdLimbs } from './hold';
import { LM, N_LM, type Track, type XY } from './types';

const frame = (hipX: number): XY[] => {
  const f: XY[] = Array.from({ length: N_LM }, () => [0, 0] as XY);
  f[LM.leftHip] = [hipX, 100]; f[LM.rightHip] = [hipX + 10, 100]; f[LM.leftShoulder] = [hipX, 20]; f[LM.rightShoulder] = [hipX + 10, 20];
  f[LM.leftKnee] = [hipX + 5, 150]; f[LM.leftAnkle] = [hipX + 8, 200]; f[LM.leftHeel] = [hipX + 6, 205]; f[LM.leftToe] = [hipX + 14, 205];
  f[LM.rightKnee] = [hipX + 15, 150]; f[LM.rightAnkle] = [hipX + 18, 200]; f[LM.rightHeel] = [hipX + 16, 205]; f[LM.rightToe] = [hipX + 24, 205];
  f[LM.leftElbow] = [hipX - 10, 50]; f[LM.leftWrist] = [hipX - 12, 80]; f[LM.rightElbow] = [hipX + 20, 50]; f[LM.rightWrist] = [hipX + 22, 80];
  return f;
};
const hide = (f: XY[], joints: number[]) => { const g = f.map((p) => [p[0], p[1]] as XY); for (const j of joints) g[j] = [NaN, NaN]; return g; };

describe('holdLimbs', () => {
  it('carries the last known leg along with the hip through a short gap', () => {
    const legL = [LM.leftKnee, LM.leftAnkle, LM.leftHeel, LM.leftToe];
    const xy: Track = [frame(0), hide(frame(10), legL), hide(frame(20), legL), frame(30)];
    const r = holdLimbs(xy, 30, { maxSeconds: 1 });
    expect(r.held.leftLeg).toBe(2);
    expect(r.xy[1][LM.leftKnee]).toEqual([15, 150]); // knee of frame 0 (5,150) moved with the hip (+10)
    expect(r.xy[2][LM.leftAnkle]).toEqual([28, 200]);
    expect(r.xy[3][LM.leftKnee]).toEqual([35, 150]); // untouched known frame
    expect(r.held.rightLeg).toBe(0);
  });

  it('leaves long gaps hidden and borrows the first known pose at a clip start', () => {
    const legR = [LM.rightKnee, LM.rightAnkle, LM.rightHeel, LM.rightToe];
    const long: Track = [frame(0), ...Array.from({ length: 40 }, (_, k) => hide(frame(k), legR)), frame(50)];
    expect(holdLimbs(long, 30, { maxSeconds: 1 }).held.rightLeg).toBe(0);
    const start: Track = [hide(frame(0), legR), hide(frame(5), legR), frame(10)];
    const r = holdLimbs(start, 30, { maxSeconds: 1 });
    expect(r.held.rightLeg).toBe(2);
    expect(r.xy[0][LM.rightKnee]).toEqual([15, 150]); // frame 2's knee (25,150) moved back with the hip (−10)
  });
});
