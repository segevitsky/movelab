import { describe, expect, it } from 'vitest';
import { hands, HAND_POINTS } from './hands';
import { LM, type RawFrame, type Track, type XY } from './types';

/** a synthetic arm: elbow fixed, forearm (length 100) turning through 90° over the clip; the hand's 21 points sit
 *  at fixed offsets in the forearm frame, so the right answer is known exactly */
function scene(n: number, opts: { dropFrames?: number[]; farPoint?: boolean; wristAway?: boolean; scores?: number } = {}) {
  const torso = 250, fps = 30;
  const elbow: XY = [500, 500];
  const offsets: XY[] = Array.from({ length: HAND_POINTS }, (_, j) => [10 + (j % 4) * 12, (Math.floor(j / 4) - 2) * 9]);
  const raw: RawFrame[] = [], cleaned: Track = [], want: XY[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * (Math.PI / 2);
    const u: XY = [Math.cos(a), Math.sin(a)], v: XY = [-u[1], u[0]];
    const wrist: XY = [elbow[0] + u[0] * 100, elbow[1] + u[1] * 100];
    const pts = offsets.map((o) => [wrist[0] + u[0] * o[0] + v[0] * o[1], wrist[1] + u[1] * o[0] + v[1] * o[1]] as XY);
    want.push(pts);
    const xy: XY[] = Array.from({ length: 33 }, () => [0, 0]);
    xy[LM.leftElbow] = elbow; xy[LM.leftWrist] = wrist; xy[LM.leftShoulder] = [500, 300]; xy[LM.leftHip] = [500, 550];
    const handPts = pts.map((p) => [p[0], p[1]] as [number, number]);
    if (opts.farPoint) handPts[8] = [wrist[0] + 400, wrist[1]]; // index tip "firing to the sky"
    if (opts.wristAway) handPts[0] = [wrist[0] + 200, wrist[1] + 200];
    const scores = new Array(HAND_POINTS).fill(opts.scores ?? 0.9);
    const other = handPts.map((p) => [p[0] - 300, p[1]] as [number, number]);
    const f: RawFrame = { t: i / fps, xy, v: new Array(33).fill(0.9), wb: { hands: [handPts, other], handScores: [scores, scores], feet: [], feetScores: [] } };
    if (opts.dropFrames?.includes(i)) delete f.wb;
    raw.push(f);
    cleaned.push(xy.map((p) => [p[0], p[1]] as XY));
  }
  return { raw, cleaned, want, torso, fps };
}

describe('hands(): 21 finger points carried in the forearm frame (Phase 17 step 3)', () => {
  it('follows the turning forearm within a pixel', () => {
    const { raw, cleaned, want, torso, fps } = scene(60);
    const h = hands(raw, cleaned, fps, { torso });
    let maxD = 0, drawn = 0;
    h.xy.forEach((fr, i) => { const hand = fr[0]; if (!hand) return; drawn++; hand.forEach((p, j) => { if (p) maxD = Math.max(maxD, Math.hypot(p[0] - want[i][j][0], p[1] - want[i][j][1])); }); });
    expect(drawn).toBe(60);
    expect(maxD).toBeLessThan(1);
    expect(h.ok.every((o) => o[0])).toBe(true);
  });

  it('a point farther than a hand can reach is dropped, the rest of the hand stays', () => {
    const { raw, cleaned, torso, fps } = scene(40, { farPoint: true });
    const h = hands(raw, cleaned, fps, { torso });
    expect(h.xy[20][0]![8]).toBeNull();
    expect(h.xy[20][0]![7]).not.toBeNull();
  });

  it("a hand whose wrist is not at this arm's wrist is not this arm's hand", () => {
    const { raw, cleaned, torso, fps } = scene(40, { wristAway: true });
    const h = hands(raw, cleaned, fps, { torso });
    expect(h.xy.every((fr) => fr[0] === null)).toBe(true);
  });

  it('low scores are not trusted; a short gap is bridged, a long one stays empty', () => {
    const { raw, cleaned, torso, fps } = scene(150);
    expect(hands(raw, cleaned, fps, { torso, minScore: 0.95 }).xy.every((fr) => fr[0] === null)).toBe(true);
    const short = scene(150, { dropFrames: Array.from({ length: 20 }, (_, k) => 50 + k) });
    const hs = hands(short.raw, short.cleaned, fps, { torso });
    expect(hs.xy[60][0]).not.toBeNull();
    expect(hs.ok[60][0]).toBe(false);
    const long = scene(150, { dropFrames: Array.from({ length: 75 }, (_, k) => 40 + k) });
    const hl = hands(long.raw, long.cleaned, fps, { torso });
    expect(hl.xy[70][0]).toBeNull();
    expect(hl.xy[30][0]).not.toBeNull();
  });
});
