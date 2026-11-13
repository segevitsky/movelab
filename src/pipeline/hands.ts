/**
 * Phase 17 step 3 — finger joints from the whole-body model (COCO-WholeBody hand = OpenPose 21-point hand:
 * 0 wrist, 1–4 thumb CMC→tip, 5–8 index MCP→tip, 9–12 middle, 13–16 ring, 17–20 pinky).
 *
 * Same recipe as `feet()`: every point is expressed relative to the *cleaned* wrist in forearm coordinates
 * (signed angle to the elbow→wrist axis, length as a ratio of the forearm) so the hand moves with the arm;
 * short gaps are interpolated and the series smoothed in that space, then projected back onto the cleaned
 * forearm. Nothing is invented: a hand whose own wrist sits far from the body's wrist (the model put it on the
 * other arm or on nothing) is dropped for that frame, points farther from the wrist than a hand can reach are
 * dropped, gaps longer than `maxGapSeconds` (the owner's 2 s hold rule) stay empty, and a point measured in
 * fewer than 5 frames is never drawn.
 */
import { fillGaps, hypot2, isNum, savgol, unwrap } from './math';
import { LM, type HandTrack, type RawFrame, type Track, type XY } from './types';

export const HAND_POINTS = 21;
/** finger chains in hand-point indices (thumb starts at the wrist) */
export const FINGERS: number[][] = [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
/** palm outline: wrist and the four finger bases */
export const PALM = [0, 5, 9, 13, 17];

export type HandsOptions = {
  /** per-point model score needed to use a measurement */
  minScore?: number; // 0.3
  /** torso length (px) — the hand's reach is judged against it */
  torso: number;
  /** a point farther than this × torso from the wrist is not a hand point */
  maxReach?: number; // 0.6
  /** the hand's own wrist farther than this × torso from the body wrist → not this arm's hand */
  maxWristGap?: number; // 0.25
  smoothSeconds?: number; // 0.25
  /** gaps longer than this stay empty */
  maxGapSeconds?: number; // 2
  /** per-frame vertical offset already applied to `cleaned` (pinToFloor); raw points get the same */
  pinOffset?: number[];
};

export function hands(raw: RawFrame[], cleaned: Track, fps: number, opts: HandsOptions): HandTrack {
  const minScore = opts.minScore ?? 0.3;
  const maxReach = (opts.maxReach ?? 0.6) * opts.torso;
  const maxWristGap = (opts.maxWristGap ?? 0.25) * opts.torso;
  const maxGap = Math.round((opts.maxGapSeconds ?? 2) * fps);
  const n = cleaned.length;
  const wristIdx = [LM.leftWrist, LM.rightWrist], elbowIdx = [LM.leftElbow, LM.rightElbow];
  const out: HandTrack = { xy: Array.from({ length: n }, () => [null, null]), ok: Array.from({ length: n }, () => [false, false]) };
  const w = Math.floor(fps * (opts.smoothSeconds ?? 0.25)) | 1;

  for (let s = 0; s < 2; s++) {
    const ang = Array.from({ length: HAND_POINTS }, () => new Array<number>(n).fill(NaN));
    const rat = Array.from({ length: HAND_POINTS }, () => new Array<number>(n).fill(NaN));
    const measured = new Array<boolean>(n).fill(false);
    for (let k = 0; k < n; k++) {
      const f = raw[k];
      const hand = f.wb?.hands?.[s], sc = f.wb?.handScores?.[s];
      if (!hand || !sc || hand.length < HAND_POINTS) continue;
      const wr = cleaned[k][wristIdx[s]], el = cleaned[k][elbowIdx[s]];
      if (!isNum(wr[0]) || !isNum(el[0])) continue;
      const off = opts.pinOffset?.[k] ?? 0;
      const fore: XY = [wr[0] - el[0], wr[1] - el[1]];
      const fl = Math.hypot(fore[0], fore[1]);
      if (fl < 1e-3) continue;
      // the hand must belong to this wrist
      const hw: XY = [hand[0][0], hand[0][1] + off];
      if (sc[0] < minScore || hypot2(hw, wr) > maxWristGap) continue;
      let any = false;
      for (let j = 0; j < HAND_POINTS; j++) {
        if (sc[j] < minScore) continue;
        const v: XY = [hand[j][0] - wr[0], hand[j][1] + off - wr[1]];
        const d = Math.hypot(v[0], v[1]);
        if (d > maxReach) continue;
        ang[j][k] = Math.atan2(fore[0] * v[1] - fore[1] * v[0], fore[0] * v[0] + fore[1] * v[1]);
        rat[j][k] = d / fl;
        any = true;
      }
      measured[k] = any;
    }
    // frames inside a gap longer than the hold limit stay empty
    const drawable = new Array<boolean>(n).fill(false);
    let i = 0;
    while (i < n) {
      if (measured[i]) { drawable[i] = true; i++; continue; }
      let j = i;
      while (j < n && !measured[j]) j++;
      const bounded = i > 0 && j < n;
      if (bounded && j - i <= maxGap) for (let k = i; k < j; k++) drawable[k] = true;
      i = j;
    }
    const pts: (XY | null)[][] = Array.from({ length: n }, () => new Array<XY | null>(HAND_POINTS).fill(null));
    let anyPoint = false;
    for (let j = 0; j < HAND_POINTS; j++) {
      const idx: number[] = [];
      for (let k = 0; k < n; k++) if (isNum(ang[j][k])) idx.push(k);
      if (idx.length < 5) continue;
      anyPoint = true;
      const aU = unwrap(idx.map((k) => ang[j][k]));
      const aFull = new Array<number>(n).fill(NaN), rFull = new Array<number>(n).fill(NaN);
      idx.forEach((k, m) => { aFull[k] = aU[m]; rFull[k] = rat[j][k]; });
      let a = fillGaps(aFull), r = fillGaps(rFull);
      if (n > w) { a = savgol(a, w, 2); r = savgol(r, w, 2); }
      for (let k = 0; k < n; k++) {
        if (!drawable[k]) continue;
        const wr = cleaned[k][wristIdx[s]], el = cleaned[k][elbowIdx[s]];
        if (!isNum(wr[0]) || !isNum(el[0]) || !isNum(a[k]) || !isNum(r[k])) continue;
        const fore: XY = [wr[0] - el[0], wr[1] - el[1]];
        const fl = Math.hypot(fore[0], fore[1]) + 1e-6;
        const u: XY = [fore[0] / fl, fore[1] / fl];
        const c = Math.cos(a[k]), sn = Math.sin(a[k]);
        pts[k][j] = [wr[0] + (u[0] * c - u[1] * sn) * r[k] * fl, wr[1] + (u[0] * sn + u[1] * c) * r[k] * fl];
      }
    }
    if (!anyPoint) continue;
    for (let k = 0; k < n; k++) {
      if (!drawable[k] || !pts[k].some((p) => p)) continue;
      out.xy[k][s] = pts[k];
      out.ok[k][s] = measured[k];
    }
  }
  return out;
}
