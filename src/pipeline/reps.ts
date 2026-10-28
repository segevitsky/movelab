import { hypot2, median } from './math';
import { LM, MP2COCO, type LoopResult, type PeriodResult, type Track } from './types';

/**
 * Body-normalised pose vector per frame: hip-centred, divided by the median torso length.
 * Uses the COCO-17 subset of the 33 landmarks so face/hand points don't dominate (the validated
 * prototype worked on COCO-17). Port of reps.py `normalise`.
 */
export function normalise(xy: Track): { N: number[][]; torso: number } {
  const n = xy.length;
  const mh = xy.map((fr) => [(fr[LM.leftHip][0] + fr[LM.rightHip][0]) / 2, (fr[LM.leftHip][1] + fr[LM.rightHip][1]) / 2]);
  const ms = xy.map((fr) => [(fr[LM.leftShoulder][0] + fr[LM.rightShoulder][0]) / 2, (fr[LM.leftShoulder][1] + fr[LM.rightShoulder][1]) / 2]);
  const torso = median(ms.map((s, i) => hypot2(s, mh[i])));
  const N: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v: number[] = [];
    for (const j of MP2COCO) v.push((xy[i][j][0] - mh[i][0]) / torso, (xy[i][j][1] - mh[i][1]) / torso);
    N[i] = v;
  }
  return { N, torso };
}

function dist(a: number[], b: number[]) {
  let s = 0;
  for (let k = 0; k < a.length; k++) { const d = a[k] - b[k]; s += d * d; }
  return Math.sqrt(s);
}

/**
 * Period of a repeating movement by pose autocorrelation (reps.py `find_period`):
 * mean distance at lag L for L ∈ [lo, hi] seconds; the period is the first strong local minimum
 * (< 0.55 × median) or else the global minimum; `periodic` when score < 0.6.
 */
export function findPeriod(xy: Track, fps: number, lo = 1.5, hi = 8.0): PeriodResult | null {
  const { N } = normalise(xy);
  const n = N.length;
  const lagLo = Math.floor(fps * lo);
  const lagHi = Math.min(Math.floor(fps * hi), n - Math.floor(fps * 1.0));
  const lags: number[] = [];
  for (let L = lagLo; L < lagHi; L++) lags.push(L);
  if (lags.length === 0) return null;
  const D = lags.map((L) => {
    let s = 0;
    for (let i = 0; i + L < n; i++) s += dist(N[i + L], N[i]);
    return s / (n - L);
  });
  const base = median(D);
  let i = 0;
  for (let k = 1; k < D.length; k++) if (D[k] < D[i]) i = k;
  for (let j = 1; j < D.length - 1; j++) {
    if (D[j] < D[j - 1] && D[j] <= D[j + 1] && D[j] < base * 0.55) { i = j; break; }
  }
  const L = lags[i];
  const score = D[i] / base;
  return { period: L / fps, lag: L, score, periodic: score < 0.6 };
}

/** The one-period window whose start and end pose (and velocity) match best (reps.py `best_loop`). */
export function bestLoop(xy: Track, lag: number): LoopResult {
  const { N } = normalise(xy);
  const n = N.length;
  let best: LoopResult = { i0: 0, i1: lag, err: Infinity };
  for (let i = 0; i + lag + 1 < n; i++) {
    const vA = N[i + 1].map((v, k) => v - N[i][k]);
    const vB = N[i + lag + 1].map((v, k) => v - N[i + lag][k]);
    const e = dist(N[i], N[i + lag]) + 0.5 * dist(vA, vB);
    if (e < best.err) best = { i0: i, i1: i + lag, err: e };
  }
  return best;
}

/** Approximate rep count for a periodic segment. */
export function repCount(nFrames: number, lag: number) {
  return nFrames / lag;
}
