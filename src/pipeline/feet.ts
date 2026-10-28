import { fillGaps, hypot2, isNum, savgol, unwrap } from './math';
import { LM, type FootTrack, type RawFrame, type Track, type XY } from './types';

export type FeetOptions = {
  /** heel/toe visibility needed to use a measurement */
  minVisibility?: number; // 0.3
  /** foot longer than this × shin is rejected */
  maxRatio?: number; // 0.7
  /** smoothing window in seconds (order 2) */
  smoothSeconds?: number; // 0.25
};

/**
 * Port of feetproc.py `build()` fed directly from MediaPipe heel (29/30) or toe (31/32) landmarks.
 * Each foot point is expressed relative to its shin (signed angle, length ratio) so it moves with the
 * leg; gaps are interpolated and smoothed in that space; then projected back onto the *cleaned* shin.
 * Only measured feet are returned (`ok`); nothing is invented.
 */
export function feet(raw: RawFrame[], cleaned: Track, fps: number, key: 'toe' | 'heel' = 'toe', opts: FeetOptions = {}): FootTrack {
  const minV = opts.minVisibility ?? 0.3;
  const maxRatio = opts.maxRatio ?? 0.7;
  const n = cleaned.length;
  const ang: number[][] = [new Array(n).fill(NaN), new Array(n).fill(NaN)];
  const rat: number[][] = [new Array(n).fill(NaN), new Array(n).fill(NaN)];
  const heelIdx = [LM.leftHeel, LM.rightHeel];
  const toeIdx = [LM.leftToe, LM.rightToe];
  const kneeIdx = [LM.leftKnee, LM.rightKnee];
  const ankleIdx = [LM.leftAnkle, LM.rightAnkle];

  for (let k = 0; k < n; k++) {
    const f = raw[k];
    if (!f.xy || !f.v) continue;
    // measured feet, matched to ankles by nearest total distance (as the prototype did)
    const meas: { side: number; p: XY }[] = [];
    for (let s = 0; s < 2; s++) {
      if (Math.min(f.v[heelIdx[s]], f.v[toeIdx[s]]) > minV) meas.push({ side: s, p: f.xy[key === 'toe' ? toeIdx[s] : heelIdx[s]] });
    }
    if (meas.length === 0) continue;
    const A = [cleaned[k][LM.leftAnkle], cleaned[k][LM.rightAnkle]];
    let pairs: [number, XY][];
    if (meas.length === 2) {
      const c1 = hypot2(meas[0].p, A[0]) + hypot2(meas[1].p, A[1]);
      const c2 = hypot2(meas[0].p, A[1]) + hypot2(meas[1].p, A[0]);
      pairs = c1 <= c2 ? [[0, meas[0].p], [1, meas[1].p]] : [[1, meas[0].p], [0, meas[1].p]];
    } else {
      const j = hypot2(meas[0].p, A[0]) <= hypot2(meas[0].p, A[1]) ? 0 : 1;
      pairs = [[j, meas[0].p]];
    }
    for (const [j, pt] of pairs) {
      const kn = cleaned[k][kneeIdx[j]];
      const an = cleaned[k][ankleIdx[j]];
      const s: XY = [an[0] - kn[0], an[1] - kn[1]];
      const sl = Math.hypot(s[0], s[1]) + 1e-6;
      const v: XY = [pt[0] - an[0], pt[1] - an[1]];
      const r = Math.hypot(v[0], v[1]) / sl;
      if (r > maxRatio) continue;
      ang[j][k] = Math.atan2(s[0] * v[1] - s[1] * v[0], s[0] * v[0] + s[1] * v[1]);
      rat[j][k] = r;
    }
  }

  const out: (XY | null)[][] = Array.from({ length: n }, () => [null, null]);
  const ok: [boolean, boolean][] = Array.from({ length: n }, () => [false, false]);
  const w = Math.floor(fps * (opts.smoothSeconds ?? 0.25)) | 1;
  for (let j = 0; j < 2; j++) {
    const idx: number[] = [];
    for (let k = 0; k < n; k++) if (isNum(ang[j][k])) { idx.push(k); ok[k][j] = true; }
    if (idx.length < 5) continue;
    const aU = unwrap(idx.map((k) => ang[j][k]));
    const aFull = new Array(n).fill(NaN);
    const rFull = new Array(n).fill(NaN);
    idx.forEach((k, m) => { aFull[k] = aU[m]; rFull[k] = rat[j][k]; });
    let a = fillGaps(aFull);
    let r = fillGaps(rFull);
    if (n > w) { a = savgol(a, w, 2); r = savgol(r, w, 2); }
    for (let k = 0; k < n; k++) {
      const kn = cleaned[k][kneeIdx[j]];
      const an = cleaned[k][ankleIdx[j]];
      const s: XY = [an[0] - kn[0], an[1] - kn[1]];
      const sl = Math.hypot(s[0], s[1]) + 1e-6;
      const su: XY = [s[0] / sl, s[1] / sl];
      const c = Math.cos(a[k]);
      const sn = Math.sin(a[k]);
      const rot: XY = [su[0] * c - su[1] * sn, su[0] * sn + su[1] * c];
      out[k][j] = [an[0] + rot[0] * r[k] * sl, an[1] + rot[1] * r[k] * sl];
    }
  }
  return { xy: out, ok };
}
