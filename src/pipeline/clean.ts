import { fillGaps, hypot2, isNum, medfilt, median, savgol } from './math';
import { LM, N_LM, type RawFrame, type Track, type XY } from './types';

export type CleanOptions = {
  /** visibility below this → unknown (NaN) */
  confThreshold?: number; // 0.35
  /** L/R swap accepted when the swapped cost is below this fraction of the unswapped cost */
  swapRatio?: number; // 0.6
  /** Savitzky–Golay window in seconds and polynomial order */
  smoothSeconds?: number; // 0.37
  smoothOrder?: number; // 3
  /** median window (seconds) used to find spikes */
  spikeSeconds?: number; // 0.2
  /** gaps longer than this (seconds) are NOT bridged — the joint stays unknown and is not drawn.
   *  undefined = bridge everything (the Python reference behaviour). */
  maxGapSeconds?: number;
};

/** Pairs that may be mislabelled left↔right, per group (arms, legs). Port of proc.py with MP-33 indices. */
const SWAP_GROUPS: [number, number][][] = [
  [[LM.leftElbow, LM.rightElbow], [LM.leftWrist, LM.rightWrist]],
  [[LM.leftKnee, LM.rightKnee], [LM.leftAnkle, LM.rightAnkle]],
];

/** Raw frames → [frame][33] xy with NaN where missing, and the visibility array. */
export function toTrack(frames: RawFrame[]): { xy: Track; conf: number[][] } {
  const xy: Track = frames.map((f) =>
    f.xy && f.xy.length === N_LM ? f.xy.map((p) => [p[0], p[1]] as XY) : Array.from({ length: N_LM }, () => [NaN, NaN] as XY),
  );
  const conf = frames.map((f) => (f.xy && f.v && f.v.length === N_LM ? f.v.slice() : new Array(N_LM).fill(0)));
  return { xy, conf };
}

/**
 * Port of reference/pose-pipeline/proc.py `clean()`:
 * 1. fix left/right identity swaps on arms and legs (frame to frame)
 * 2. visibility < threshold → NaN
 * 3. remove spikes vs a median-filtered track
 * 4. linear gap fill
 * 5. Savitzky–Golay smoothing (≈0.37 s, order 3)
 * Never clamps bone lengths, never invents joints.
 */
export function clean(xyIn: Track, confIn: number[][], fps: number, opts: CleanOptions = {}): Track {
  const thr = opts.confThreshold ?? 0.35;
  const swapRatio = opts.swapRatio ?? 0.6;
  const n = xyIn.length;
  const xy: Track = xyIn.map((fr) => fr.map((p) => [p[0], p[1]] as XY));
  const conf = confIn.map((c) => c.slice());

  // 1. swap fix
  for (const grp of SWAP_GROUPS) {
    for (let i = 1; i < n; i++) {
      let keep = 0;
      let swap = 0;
      for (const [a, b] of grp) {
        keep += hypot2(xy[i][a], xy[i - 1][a]) + hypot2(xy[i][b], xy[i - 1][b]);
        swap += hypot2(xy[i][b], xy[i - 1][a]) + hypot2(xy[i][a], xy[i - 1][b]);
      }
      if (swap < keep * swapRatio) {
        for (const [a, b] of grp) {
          const pa = xy[i][a];
          xy[i][a] = xy[i][b];
          xy[i][b] = pa;
          const ca = conf[i][a];
          conf[i][a] = conf[i][b];
          conf[i][b] = ca;
        }
      }
    }
  }

  // 2. confidence mask
  for (let i = 0; i < n; i++) for (let j = 0; j < N_LM; j++) if (conf[i][j] < thr) xy[i][j] = [NaN, NaN];

  // 3. spikes
  const k = Math.max(3, Math.floor(fps * (opts.spikeSeconds ?? 0.2)) | 1);
  for (let j = 0; j < N_LM; j++) {
    for (let a = 0; a < 2; a++) {
      const v = xy.map((fr) => fr[j][a]);
      let ok = 0;
      for (const x of v) if (isNum(x)) ok++;
      if (ok < 4) continue;
      const f = fillGaps(v);
      const m = medfilt(f, k);
      const dev = f.map((x, i) => Math.abs(x - m[i]));
      const scale = median(dev) * 6 + 6;
      for (let i = 0; i < n; i++) if (dev[i] > scale) xy[i][j][a] = NaN;
    }
  }

  // 4. gap fill (remember long gaps so they can be re-opened after smoothing)
  const maxGap = opts.maxGapSeconds !== undefined ? Math.round(opts.maxGapSeconds * fps) : Infinity;
  const hide: boolean[][] = Array.from({ length: n }, () => new Array(N_LM).fill(false));
  for (let j = 0; j < N_LM; j++) {
    // runs of unknown frames (both coords NaN) longer than maxGap, or touching either end
    let i = 0;
    while (i < n) {
      if (isNum(xy[i][j][0])) { i++; continue; }
      let k = i;
      while (k < n && !isNum(xy[k][j][0])) k++;
      const len = k - i;
      if (len > maxGap || i === 0 || k === n) for (let m = i; m < k; m++) hide[m][j] = true;
      i = k;
    }
    for (let a = 0; a < 2; a++) {
      const filled = fillGaps(xy.map((fr) => fr[j][a]));
      for (let i2 = 0; i2 < n; i2++) xy[i2][j][a] = filled[i2];
    }
  }

  // 5. smooth
  const w = Math.max(5, Math.floor(fps * (opts.smoothSeconds ?? 0.37)) | 1);
  if (n > w) {
    for (let j = 0; j < N_LM; j++) {
      for (let a = 0; a < 2; a++) {
        const s = savgol(xy.map((fr) => fr[j][a]), w, opts.smoothOrder ?? 3);
        for (let i = 0; i < n; i++) xy[i][j][a] = s[i];
      }
    }
  }
  if (maxGap !== Infinity) {
    // joints that were never (or almost never) seen stay unknown too
    for (let j = 0; j < N_LM; j++) {
      let seen = 0;
      for (let i = 0; i < n; i++) if (!hide[i][j]) seen++;
      const never = seen < Math.max(3, n * 0.15);
      for (let i = 0; i < n; i++) if (hide[i][j] || never) xy[i][j] = [NaN, NaN];
    }
  }
  return xy;
}

/** Torso length per frame (mid-shoulder ↔ mid-hip), NaN when unknown. */
export function torsoLengths(xy: Track): number[] {
  return xy.map((fr) => {
    const ms: XY = [(fr[LM.leftShoulder][0] + fr[LM.rightShoulder][0]) / 2, (fr[LM.leftShoulder][1] + fr[LM.rightShoulder][1]) / 2];
    const mh: XY = [(fr[LM.leftHip][0] + fr[LM.rightHip][0]) / 2, (fr[LM.leftHip][1] + fr[LM.rightHip][1]) / 2];
    return hypot2(ms, mh);
  });
}
