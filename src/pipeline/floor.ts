/**
 * Phase 2.5 step 3 — floor fit + root pinning (pure).
 * - Floor: robust line y = a·x + b through the contact points of a segment (Theil–Sen); with a mat quad
 *   (Arch §5a) the mat's near edge (BL → BR) is the floor instead.
 * - Root pinning: per frame, ONE vertical offset applied to the whole figure so the contact points sit
 *   on the floor; the offset is smoothed with a One-Euro filter. No single joint is ever moved.
 */
import { CONTACT_JOINT, CONTACT_POINTS, type Contacts } from './contacts';
import { median } from './math';
import { oneEuro } from './oneEuro';
import type { Track, XY } from './types';

/**
 * Floor model in image space: y = a·x + b + c·z, where z is the contact point's MediaPipe world depth
 * (metres, hip-centred; negative = nearer the camera). A floor is a plane: two planted hands at the same
 * x but different depth sit at different image y (0.16 torso apart on reel 3) — a line can't express
 * that, the depth term can. c is fitted per segment (px/m) and clamped to a physical range.
 */
export type FloorLine = { a: number; b: number; c: number; source: 'contacts' | 'mat' | 'fallback'; points: number };
export type World = ([number, number, number][] | undefined)[];
export const floorYAt = (f: Pick<FloorLine, 'a' | 'b' | 'c'>, x: number, z = 0) => f.a * x + f.b + (f.c ?? 0) * z;

/** Theil–Sen: median of pairwise slopes, intercept = median(y − a·x). Subsamples pairs for speed. */
export function theilSen(points: XY[], maxPairs = 4000): { a: number; b: number } | null {
  const pts = points.filter((p) => !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
  if (pts.length < 2) return null;
  const n = pts.length;
  const slopes: number[] = [];
  const total = (n * (n - 1)) / 2;
  if (total <= maxPairs) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const dx = pts[j][0] - pts[i][0]; if (Math.abs(dx) > 1e-6) slopes.push((pts[j][1] - pts[i][1]) / dx); }
  } else {
    // deterministic stride sampling of pairs
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let k = 0; k < maxPairs; k++) { const i = Math.floor(rnd() * n), j = Math.floor(rnd() * n); if (i === j) continue; const dx = pts[j][0] - pts[i][0]; if (Math.abs(dx) > 1e-6) slopes.push((pts[j][1] - pts[i][1]) / dx); }
  }
  if (slopes.length === 0) return { a: 0, b: median(pts.map((p) => p[1])) };
  const a = median(slopes);
  // a floor can't be steep in a reel; clamp to ±35° so a few bad contacts can't tilt it absurdly
  const aC = Math.max(-0.7, Math.min(0.7, a));
  const b = median(pts.map((p) => p[1] - aC * p[0]));
  return { a: aC, b };
}

export function contactPoints(xy: Track, contacts: Contacts): XY[] {
  const out: XY[] = [];
  for (const cp of CONTACT_POINTS) { const j = CONTACT_JOINT[cp]; contacts[cp].forEach((on, i) => { if (on) out.push(xy[i][j]); }); }
  return out;
}

/** Depth coefficient from within-frame residuals (per-frame means removed — pinning absorbs those). */
export function fitDepthTerm(xy: Track, contacts: Contacts, world: World | undefined, line: { a: number; b: number }): number {
  if (!world) return 0;
  const dz: number[] = [], dr: number[] = [];
  for (let i = 0; i < xy.length; i++) {
    const w = world[i];
    if (!w) continue;
    const rows: [number, number][] = [];
    for (const cp of CONTACT_POINTS) {
      if (!contacts[cp][i]) continue;
      const j = CONTACT_JOINT[cp];
      const p = xy[i][j];
      if (Number.isNaN(p[0])) continue;
      rows.push([w[j][2], p[1] - (line.a * p[0] + line.b)]);
    }
    if (rows.length < 2) continue;
    const mz = rows.reduce((s, r) => s + r[0], 0) / rows.length, mr = rows.reduce((s, r) => s + r[1], 0) / rows.length;
    for (const [z, r] of rows) { dz.push(z - mz); dr.push(r - mr); }
  }
  const ratios = dz.map((z, k) => (Math.abs(z) > 0.02 ? dr[k] / z : NaN)).filter((v) => !Number.isNaN(v));
  if (ratios.length < 20) return 0;
  // nearer (z < 0) must be lower on screen (larger y): c ≤ 0; cap the magnitude
  return Math.max(-80, Math.min(0, median(ratios)));
}

export function fitFloor(xy: Track, contacts: Contacts, opts: { matQuad?: XY[]; fallbackY?: number; world?: World } = {}): FloorLine {
  if (opts.matQuad && opts.matQuad.length === 4) {
    const [, , br, bl] = opts.matQuad; // TL, TR, BR, BL
    const dx = br[0] - bl[0];
    const a = Math.abs(dx) > 1e-6 ? (br[1] - bl[1]) / dx : 0;
    const line = { a, b: bl[1] - a * bl[0] };
    return { ...line, c: fitDepthTerm(xy, contacts, opts.world, line), source: 'mat', points: 4 };
  }
  const pts = contactPoints(xy, contacts);
  const fit = pts.length >= 8 ? theilSen(pts) : null;
  if (fit) return { ...fit, c: fitDepthTerm(xy, contacts, opts.world, fit), source: 'contacts', points: pts.length };
  return { a: 0, b: opts.fallbackY ?? median(xy.map((f) => Math.max(f[27][1], f[28][1]))), c: 0, source: 'fallback', points: pts.length };
}

export type PinResult = { xy: Track; offset: number[]; raw: number[] };

/**
 * Root pinning. For each frame with contacts, offset = mean over contact points of (floorY(x) − y)
 * (positive = move down). Frames without contacts keep the previous offset (held), then the series is
 * One-Euro-smoothed and applied to every joint of every frame (vertical only).
 */
export function pinToFloor(xy: Track, contacts: Contacts, floor: Pick<FloorLine, 'a' | 'b' | 'c'>, fps: number, opts: { maxOffsetTorso?: number; torso?: number; minCutoff?: number; beta?: number; world?: World } = {}): PinResult {
  const n = xy.length;
  const raw = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    const w = opts.world?.[i];
    for (const cp of CONTACT_POINTS) {
      if (!contacts[cp][i]) continue;
      const j = CONTACT_JOINT[cp];
      const p = xy[i][j];
      if (Number.isNaN(p[0])) continue;
      s += floorYAt(floor, p[0], w ? w[j][2] : 0) - p[1];
      c++;
    }
    if (c) raw[i] = s / c;
  }
  // hold the last known offset across gaps (and the first known one backwards)
  let last = NaN;
  const held = raw.slice();
  for (let i = 0; i < n; i++) { if (!Number.isNaN(held[i])) last = held[i]; else held[i] = last; }
  let first = NaN;
  for (let i = 0; i < n; i++) if (!Number.isNaN(held[i])) { first = held[i]; break; }
  for (let i = 0; i < n && Number.isNaN(held[i]); i++) held[i] = first;
  if (Number.isNaN(first)) return { xy, offset: new Array(n).fill(0), raw };
  // limit how far a frame may be moved (a mis-detected contact must not yank the figure)
  const lim = (opts.maxOffsetTorso ?? 0.6) * (opts.torso ?? 100);
  const clamped = held.map((v) => Math.max(-lim, Math.min(lim, v)));
  const offset = oneEuro(clamped, fps, { minCutoff: opts.minCutoff ?? 0.8, beta: opts.beta ?? 0.01 });
  const out: Track = xy.map((fr, i) => fr.map((p) => (Number.isNaN(p[0]) ? p : ([p[0], p[1] + offset[i]] as XY))));
  return { xy: out, offset, raw };
}
