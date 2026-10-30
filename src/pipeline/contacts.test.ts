import { describe, expect, it } from 'vitest';
import { clean, toTrack } from './clean';
import { contacts, footContact, hysteresis } from './contacts';
import { torsoOf } from './eval/metrics';
import { LM } from './types';
import { framesBetween, loadExpected, loadReel } from './__fixtures__/load';

describe('hysteresis', () => {
  it('needs 4 frames to switch either way', () => {
    const s = [false, true, false, true, true, true, true, true, false, false, true, true, false, false, false, false, false];
    expect(hysteresis(s, 4)).toEqual([false, false, false, true, true, true, true, true, true, true, true, true, false, false, false, false, false]);
  });
});

describe('contacts() on reel 3 (burpee-lunge)', () => {
  const exp = loadExpected('reel3_burpee_mp33');
  const seg = exp.segments[0];
  const frames = framesBetween(loadReel('reel3_burpee_mp33'), seg.a, seg.b);
  const { xy, conf } = toTrack(frames);
  const cl = clean(xy, conf, exp.fps);
  const torso = torsoOf(cl);
  const c = contacts(cl, exp.fps, torso);
  const t = (i: number) => frames[i].t;
  const speed = (i: number, j: number) => (i > 0 ? (Math.hypot(cl[i][j][0] - cl[i - 1][j][0], cl[i][j][1] - cl[i - 1][j][1]) / torso) * exp.fps : 0);
  // push-up phases: torso horizontal AND both wrists slow (the burpee's jumps move the hands and are not contact)
  const pushUp = cl.map((_, i) => i).filter((i) => Math.abs(cl[i][LM.leftShoulder][1] - cl[i][LM.leftHip][1]) / torso < 0.5 && speed(i, LM.leftWrist) < 1 && speed(i, LM.rightWrist) < 1);
  it('hands are in contact during the push-up', () => {
    expect(pushUp.length).toBeGreaterThan(60);
    const both = pushUp.filter((i) => c.handL[i] && c.handR[i]).length;
    expect(both / pushUp.length).toBeGreaterThan(0.85);
  });
  it('the raised leg is never in contact in the push-up; the floor foot is', () => {
    const one = pushUp.filter((i) => footContact(c, 'L')[i] !== footContact(c, 'R')[i]).length;
    const both = pushUp.filter((i) => footContact(c, 'L')[i] && footContact(c, 'R')[i]).length;
    expect(both / pushUp.length).toBeLessThan(0.15); // one-leg push-up: both feet planted should be rare
    expect(one / pushUp.length).toBeGreaterThan(0.6);
    for (const i of pushUp) {
      const lY = Math.max(cl[i][LM.leftHeel][1], cl[i][LM.leftToe][1]);
      const rY = Math.max(cl[i][LM.rightHeel][1], cl[i][LM.rightToe][1]);
      if (footContact(c, 'L')[i] && !footContact(c, 'R')[i]) expect(lY).toBeGreaterThan(rY - torso * 0.3);
      if (footContact(c, 'R')[i] && !footContact(c, 'L')[i]) expect(rY).toBeGreaterThan(lY - torso * 0.3);
    }
  });
  it('a planted foot exists in the lunge (standing phases) and contacts never flicker faster than 4 frames', () => {
    const standing = cl.map((f, i) => i).filter((i) => Math.abs(cl[i][LM.leftShoulder][1] - cl[i][LM.leftHip][1]) / torso > 0.8);
    expect(standing.length).toBeGreaterThan(20);
    const planted = standing.filter((i) => footContact(c, 'L')[i] || footContact(c, 'R')[i]).length;
    expect(planted / standing.length).toBeGreaterThan(0.5);
    // when no foot is planted while upright, the person is airborne: both feet moving fast
    for (const i of standing) {
      if (footContact(c, 'L')[i] || footContact(c, 'R')[i]) continue;
      const fast = Math.max(speed(i, LM.leftToe), speed(i, LM.rightToe), speed(i, LM.leftHeel), speed(i, LM.rightHeel));
      expect(fast).toBeGreaterThan(0.8);
    }
    for (const key of ['heelL', 'heelR', 'toeL', 'toeR', 'handL', 'handR'] as const) {
      let run = 0, minRun = Infinity;
      for (let i = 1; i < c[key].length; i++) { if (c[key][i] === c[key][i - 1]) run++; else { if (run + 1 < minRun && i > 4) minRun = run + 1; run = 0; } }
      if (minRun !== Infinity) expect(minRun).toBeGreaterThanOrEqual(4);
    }
    void t;
  });
});
