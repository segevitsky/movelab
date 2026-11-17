import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contacts } from './contacts';
import { detectSupport } from './support';
import { processCapture } from './index';
import { loadReel } from './__fixtures__/load';
import { LM, type RawFrame, type Track, type XY } from './types';

/** A still figure (torso 240 px, floor at y = 1000) built from a few joints; the rest is placed near the hips. */
function figure(n: number, place: (i: number) => Partial<Record<number, XY>>): Track {
  return Array.from({ length: n }, (_, i) => {
    const p = place(i);
    const f: XY[] = Array.from({ length: 33 }, () => [500, 600]);
    for (const k of Object.keys(p)) f[Number(k)] = p[Number(k)]!;
    return f;
  });
}
const FLOOR = { a: 0, b: 1000 }, FPS = 30, TORSO = 240;
const sup = (xy: Track) => detectSupport(xy, contacts(xy, FPS, TORSO), FLOOR, FPS, TORSO);

describe('detectSupport(): walls and bars inferred from where the body holds still', () => {
  it('a wall handstand: hands on the floor, feet still above the hips to one side → a wall there, body on the left', () => {
    const xy = figure(60, () => ({
      [LM.leftWrist]: [470, 990], [LM.rightWrist]: [530, 990], [LM.leftShoulder]: [480, 800], [LM.rightShoulder]: [520, 800],
      [LM.leftHip]: [520, 560], [LM.rightHip]: [540, 560], [LM.leftKnee]: [600, 400], [LM.rightKnee]: [610, 400],
      [LM.leftAnkle]: [660, 260], [LM.rightAnkle]: [665, 260], [LM.leftHeel]: [668, 268], [LM.rightHeel]: [672, 268], [LM.leftToe]: [655, 230], [LM.rightToe]: [658, 230],
      [LM.nose]: [500, 900],
    }));
    const s = sup(xy);
    expect(s.wall).toBeDefined();
    expect(s.wall!.x).toBeGreaterThan(640);
    expect(s.wall!.bodyLeft).toBe(true);
    expect(s.bar).toBeUndefined();
  });

  it('pull-ups: hands still above the shoulders while the body swings up and down beneath them → a bar through the hands', () => {
    const xy = figure(90, (i) => {
      const d = 120 * (1 - Math.cos((i / 90) * 2 * Math.PI * 1.5)) / 2; // the body rises 120 px and drops back, 1.5 reps
      return {
        [LM.leftWrist]: [440, 200], [LM.rightWrist]: [560, 200], [LM.leftShoulder]: [460, 450 - d], [LM.rightShoulder]: [540, 450 - d],
        [LM.leftHip]: [485, 690 - d], [LM.rightHip]: [515, 690 - d], [LM.leftKnee]: [490, 830 - d], [LM.rightKnee]: [510, 830 - d],
        [LM.leftAnkle]: [495, 900 - d], [LM.rightAnkle]: [505, 900 - d], [LM.leftHeel]: [497, 910 - d], [LM.rightHeel]: [503, 910 - d], [LM.leftToe]: [492, 925 - d], [LM.rightToe]: [508, 925 - d],
        [LM.nose]: [500, 380 - d],
      } as Partial<Record<number, XY>>;
    });
    const s = sup(xy);
    expect(s.bar).toBeDefined();
    expect(s.bar!.y).toBeCloseTo(200, 0);
    expect(s.bar!.x0).toBeLessThan(450);
    expect(s.bar!.x1).toBeGreaterThan(550);
    expect(s.wall).toBeUndefined();
  });

  it('an overhead hold while standing is not a bar, and a hand on the knee is not a wall', () => {
    const xy = figure(60, () => ({
      [LM.leftWrist]: [470, 150], [LM.rightWrist]: [530, 150], [LM.leftShoulder]: [460, 420], [LM.rightShoulder]: [540, 420],
      [LM.leftHip]: [485, 660], [LM.rightHip]: [515, 660], [LM.leftKnee]: [490, 830], [LM.rightKnee]: [510, 830],
      [LM.leftAnkle]: [495, 990], [LM.rightAnkle]: [505, 990], [LM.leftHeel]: [497, 998], [LM.rightHeel]: [503, 998], [LM.leftToe]: [470, 998], [LM.rightToe]: [530, 998],
    }));
    expect(sup(xy)).toEqual({});
    const knee = figure(60, () => ({
      [LM.leftWrist]: [590, 830], [LM.rightWrist]: [410, 830], [LM.leftShoulder]: [460, 420], [LM.rightShoulder]: [540, 420],
      [LM.leftHip]: [485, 660], [LM.rightHip]: [515, 660], [LM.leftKnee]: [590, 830], [LM.rightKnee]: [410, 830],
      [LM.leftAnkle]: [600, 990], [LM.rightAnkle]: [400, 990], [LM.leftHeel]: [602, 998], [LM.rightHeel]: [398, 998], [LM.leftToe]: [630, 998], [LM.rightToe]: [370, 998],
    }));
    expect(sup(knee)).toEqual({});
  });

  it('a wall needs a hold: the same handstand for half a second draws nothing', () => {
    const xy = figure(60, (i) => ({
      [LM.leftWrist]: [470, 990], [LM.rightWrist]: [530, 990], [LM.leftShoulder]: [480, 800], [LM.rightShoulder]: [520, 800],
      [LM.leftHip]: [520, 560], [LM.rightHip]: [540, 560], [LM.leftKnee]: [600, 400], [LM.rightKnee]: [610, 400],
      [LM.leftAnkle]: i < 12 ? [660, 260] : [540 + i * 6, 260], [LM.rightAnkle]: i < 12 ? [665, 260] : [545 + i * 6, 260],
      [LM.leftHeel]: i < 12 ? [668, 268] : [548 + i * 6, 268], [LM.rightHeel]: i < 12 ? [672, 268] : [552 + i * 6, 268],
      [LM.leftToe]: i < 12 ? [655, 230] : [535 + i * 6, 230], [LM.rightToe]: i < 12 ? [658, 230] : [538 + i * 6, 230],
    }));
    expect(sup(xy).wall).toBeUndefined();
  });

  it('none of the lab reels (floor work, burpees, a staff flow) nor the owner captures grows a wall or a bar', () => {
    for (const name of ['reel1_mobility_mp33', 'reel2_staff_mp33', 'reel3_burpee_mp33'] as const) {
      for (const seg of processCapture({ frames: loadReel(name) })) expect(seg.support ?? {}).toEqual({});
    }
    for (const name of ['capture-2026-11-02-DfC8LdUIjV4.json', 'capture-2026-11-10-DfWjXHKuRpu-hybrid.json']) {
      const cap = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'owner', name), 'utf8')) as { result: { frames: RawFrame[] } };
      for (const seg of processCapture({ frames: cap.result.frames })) expect(seg.support ?? {}).toEqual({});
    }
  });
});
