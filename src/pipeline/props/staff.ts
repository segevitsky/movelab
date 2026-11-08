/**
 * Props layer, first prop: a staff / stick / dowel held in the hands (Architecture §4.5; port of
 * reference/pose-pipeline/staffproc3.py, the behavioural spec). Pure TS.
 *
 * Input: per-frame line detections in figure pixels (from a native detector — colour mask → Hough longest line,
 * see staff.py — or any detector that returns the two visible ends), the cleaned 2D track and fps.
 * Output: a rigid rod of constant length L (97th percentile of detected lengths): per frame the two ends,
 * whether it passes behind the body, and whether that frame had a real detection.
 * - A detection is trusted when present and near a wrist. Shorter than L (partly hidden) → completed to L on
 *   the side that continues the previous centre (no end flipping).
 * - Missing frames: the centre follows the hands (offset from the wrist midpoint interpolated), the angle is
 *   interpolated (unwrapped mod π). Frames before the first / after the last detection repeat the nearest.
 * - One-Euro filter on centre and angle; outlier gating against a motion prediction; 'behind' with 4-frame
 *   hysteresis.
 * Nothing is invented beyond this: with no detections at all the result has no frames marked ok and `L = 0`.
 */
import { LM, type Track, type XY } from '../types';

export type StaffLine = { t: number; ok: boolean; p1?: [number, number]; p2?: [number, number] };

export type StaffTrack = {
  /** rod ends per frame (figure px); null when the track could not be built */
  a: (XY | null)[];
  b: (XY | null)[];
  /** the rod passes behind the torso in this frame */
  behind: boolean[];
  /** this frame had a trusted detection (others are interpolated) */
  ok: boolean[];
  /** rod length (px) */
  L: number;
};

const sub = (p: XY, q: XY): XY => [p[0] - q[0], p[1] - q[1]];
const add = (p: XY, q: XY): XY => [p[0] + q[0], p[1] + q[1]];
const mul = (p: XY, k: number): XY => [p[0] * k, p[1] * k];
const dot = (p: XY, q: XY) => p[0] * q[0] + p[1] * q[1];
const norm = (p: XY) => Math.hypot(p[0], p[1]);
const known = (p: XY | undefined): p is XY => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const k = (s.length - 1) * p;
  const i = Math.floor(k), f = k - i;
  return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * f;
}

/** Torso polygon in figure px (staffproc3 body_poly): hips → shoulders → head, widened a little. */
export function bodyPolygon(P: XY[], torso: number): XY[] | null {
  const ls = P[LM.leftShoulder], rs = P[LM.rightShoulder], lh = P[LM.leftHip], rh = P[LM.rightHip];
  if (!known(ls) || !known(rs) || !known(lh) || !known(rh)) return null;
  const ms = mul(add(ls, rs), 0.5), mh = mul(add(lh, rh), 0.5);
  const d = sub(ms, mh), len = norm(d) + 1e-6;
  const u = mul(d, 1 / len), n: XY = [-u[1], u[0]];
  const w = Math.max(norm(sub(ls, rs)), torso * 0.45) / 2 + torso * 0.08;
  const head = add(ms, mul(u, torso * 0.45)), hr = torso * 0.3;
  return [sub(mh, mul(n, w)), add(mh, mul(n, w)), add(ms, mul(n, w)), add(head, mul(n, hr)), add(head, mul(u, hr)), sub(head, mul(n, hr)), sub(ms, mul(n, w))];
}

export function pointInPolygon(poly: XY[], p: XY): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** One-Euro filter as in staffproc3 (mincut, beta, dcut) on vectors. */
function oneEuroVec(fps: number, mincut: number, beta: number, dcut = 1.0) {
  let x: number[] | null = null, dx: number[] = [];
  const alpha = (c: number) => { const r = (2 * Math.PI * c) / fps; return r / (r + 1); };
  return (v: number[]): number[] => {
    if (!x) { x = [...v]; dx = v.map(() => 0); return [...x]; }
    const ad = alpha(dcut);
    dx = v.map((vi, i) => ad * (vi - x![i]) * fps + (1 - ad) * dx[i]);
    const c = mincut + beta * Math.hypot(...dx);
    const al = alpha(c);
    x = v.map((vi, i) => al * vi + (1 - al) * x![i]);
    return [...x];
  };
}

/** Linear interpolation of a series over its known indices; edges repeat the nearest known value. */
function interpSeries(vals: number[]): number[] {
  const n = vals.length;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(vals[i])) idx.push(i);
  if (!idx.length) return vals.map(() => NaN);
  const out = new Array<number>(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (i <= idx[0]) { out[i] = vals[idx[0]]; continue; }
    if (i >= idx[idx.length - 1]) { out[i] = vals[idx[idx.length - 1]]; continue; }
    while (idx[k + 1] < i) k++;
    const i0 = idx[k], i1 = idx[k + 1];
    out[i] = vals[i0] + ((vals[i1] - vals[i0]) * (i - i0)) / (i1 - i0);
  }
  return out;
}

/** Unwrap angles that are only defined mod π (a rod has no direction) so interpolation never spins. */
function unwrapPi(th: number[]): number[] {
  const out = [...th];
  let prev: number | null = null;
  for (let i = 0; i < out.length; i++) {
    if (!Number.isFinite(out[i])) continue;
    if (prev !== null) { let v = out[i]; while (v - prev > Math.PI / 2) v -= Math.PI; while (v - prev < -Math.PI / 2) v += Math.PI; out[i] = v; }
    prev = out[i];
  }
  return out;
}

/**
 * Track the rod. `times` are the frame times of `xy` (s); `lines` are matched by nearest time.
 * `torso` = torso length in px (median over the clip).
 */
export function trackStaff(lines: StaffLine[], xy: Track, times: number[], fps: number, torso: number, opts: { /** per-frame vertical root-pinning offset already applied to xy (Phase 2.5); the lines are in raw px */ pinOffset?: number[] } = {}): StaffTrack {
  const n = xy.length;
  const none: StaffTrack = { a: new Array(n).fill(null), b: new Array(n).fill(null), behind: new Array(n).fill(false), ok: new Array(n).fill(false), L: 0 };
  const okLines = lines.filter((l) => l.ok && l.p1 && l.p2);
  if (okLines.length < 3 || n === 0) return none;
  const L = percentile(okLines.map((l) => Math.hypot(l.p2![0] - l.p1![0], l.p2![1] - l.p1![1])), 0.97);
  if (!(L > torso * 0.3)) return none;
  // nearest line per frame (lines are time-sorted)
  const lt = lines.map((l) => l.t);
  const nearest = (t: number): StaffLine => {
    let lo = 0, hi = lt.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lt[m] < t) lo = m; else hi = m; }
    return Math.abs(lt[lo] - t) <= Math.abs(lt[hi] - t) ? lines[lo] : lines[hi];
  };
  const C: (XY | null)[] = new Array(n).fill(null);
  const TH: number[] = new Array(n).fill(NaN);
  const BH: boolean[] = new Array(n).fill(false);
  let prevC: XY | null = null, prevU: XY | null = null, vel: XY = [0, 0], miss = 0;
  for (let k = 0; k < n; k++) {
    const s = nearest(times[k]);
    if (!s.ok || !s.p1 || !s.p2) continue;
    const P = xy[k];
    const dy = opts.pinOffset?.[k] ?? 0;
    let a: XY = [s.p1[0], s.p1[1] + dy], b: XY = [s.p2[0], s.p2[1] + dy];
    const l = norm(sub(b, a));
    let u = mul(sub(b, a), 1 / (l + 1e-6));
    const nn: XY = [-u[1], u[0]];
    // must pass near a wrist
    const wr = [P[LM.leftWrist], P[LM.rightWrist]].filter(known);
    if (!wr.length || Math.min(...wr.map((w) => Math.abs(dot(sub(w, a), nn)))) > torso * 0.4) continue;
    if (prevU && dot(u, prevU) < 0) { u = mul(u, -1); [a, b] = [b, a]; }
    let c: XY, bh = false;
    if (l >= L * 0.9) {
      c = mul(add(a, b), 0.5);
    } else {
      const cands: XY[] = [sub(b, mul(u, L / 2)), add(a, mul(u, L / 2))];
      let j: number;
      if (prevC) { const pred = add(prevC, vel); j = norm(sub(cands[0], pred)) <= norm(sub(cands[1], pred)) ? 0 : 1; }
      else {
        const ctr = bodyCentre(P);
        j = ctr ? (norm(sub(a, ctr)) < norm(sub(b, ctr)) ? 0 : 1) : 0;
      }
      c = cands[j];
      const hidden = j === 0 ? sub(a, mul(u, (L - l) / 2)) : add(b, mul(u, (L - l) / 2));
      const poly = bodyPolygon(P, torso);
      bh = !!poly && pointInPolygon(poly, hidden);
    }
    if (prevC && norm(sub(c, add(prevC, vel))) > torso * 0.8 && miss < 3) { miss++; continue; } // outlier vs prediction
    miss = 0;
    if (prevC) vel = add(mul(vel, 0.6), mul(sub(c, prevC), 0.4));
    C[k] = c; TH[k] = Math.atan2(u[1], u[0]); BH[k] = bh; prevC = c; prevU = u;
  }
  const okIdx = TH.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
  if (okIdx.length < 3) return none;
  // centre follows the hands through gaps; angle interpolated (unwrapped mod π)
  const hm: (XY | null)[] = xy.map((P) => (known(P[LM.leftWrist]) && known(P[LM.rightWrist]) ? mul(add(P[LM.leftWrist], P[LM.rightWrist]), 0.5) : known(P[LM.leftWrist]) ? P[LM.leftWrist] : known(P[LM.rightWrist]) ? P[LM.rightWrist] : null));
  const offX = interpSeries(C.map((c, i) => (c && hm[i] ? c[0] - hm[i]![0] : NaN)));
  const offY = interpSeries(C.map((c, i) => (c && hm[i] ? c[1] - hm[i]![1] : NaN)));
  const hmX = interpSeries(hm.map((h) => (h ? h[0] : NaN))), hmY = interpSeries(hm.map((h) => (h ? h[1] : NaN)));
  const th = interpSeries(unwrapPi(TH));
  const fc = oneEuroVec(fps, 2.5, 0.06), fa = oneEuroVec(fps, 2.5, 1.5);
  const a: (XY | null)[] = [], b: (XY | null)[] = [];
  for (let k = 0; k < n; k++) {
    const cx = hmX[k] + offX[k], cy = hmY[k] + offY[k];
    if (!Number.isFinite(cx) || !Number.isFinite(th[k])) { a.push(null); b.push(null); continue; }
    const [sx, sy] = fc([cx, cy]);
    const [st] = fa([th[k]]);
    const U: XY = [Math.cos(st), Math.sin(st)];
    a.push([sx - (U[0] * L) / 2, sy - (U[1] * L) / 2]);
    b.push([sx + (U[0] * L) / 2, sy + (U[1] * L) / 2]);
  }
  // 'behind' with 4-frame hysteresis
  const behind: boolean[] = new Array(n).fill(false);
  let state = false, run = 0;
  for (let k = 0; k < n; k++) {
    const want: boolean = Number.isFinite(TH[k]) ? BH[k] : state;
    run = want !== state ? run + 1 : 0;
    if (run >= 4) { state = want; run = 0; }
    behind[k] = state;
  }
  return { a, b, behind, ok: TH.map(Number.isFinite), L };
}

function bodyCentre(P: XY[]): XY | null {
  const js = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip].map((j) => P[j]).filter(known);
  if (js.length < 4) return null;
  return mul(js.reduce((s, p) => add(s, p), [0, 0] as XY), 1 / js.length);
}

/** Per-frame end jerk (px/frame), for tests and eval: the median should be small for a steady rod. */
export function endJerk(track: StaffTrack): number[] {
  const out: number[] = [];
  for (let i = 1; i < track.a.length; i++) {
    const a0 = track.a[i - 1], a1 = track.a[i], b0 = track.b[i - 1], b1 = track.b[i];
    if (a0 && a1 && b0 && b1) out.push(Math.max(norm(sub(a1, a0)), norm(sub(b1, b0))));
  }
  return out;
}
