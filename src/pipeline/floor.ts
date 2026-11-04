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
export type FloorLine = {
  a: number; b: number; c: number; source: 'contacts' | 'mat' | 'fallback'; points: number;
  /**
   * Phase 13 (owner fixture DfC8LdUIjV4-float): the figure's distance from the camera changes along a reel —
   * kneeling further back, then feet nearer — and a line in x cannot follow; MediaPipe's world z is
   * hip-centred so it says nothing about where the person stands. `d` is the floor's image-y shift per unit
   * of the figure's *scale* (px per metre of torso, tilt-corrected), `s0` the reference scale; nearer =
   * larger scale = lower on screen (d ≥ 0). Fitted across frames from the contact points.
   */
  d?: number; s0?: number;
};
export type World = ([number, number, number][] | undefined)[];
export const floorYAt = (f: Pick<FloorLine, 'a' | 'b' | 'c'> & { d?: number; s0?: number }, x: number, z = 0, scale?: number) =>
  f.a * x + f.b + (f.c ?? 0) * z + (f.d && f.s0 && scale !== undefined && !Number.isNaN(scale) ? f.d * (scale - f.s0) : 0);

const SH_L = 11, SH_R = 12, HIP_L = 23, HIP_R = 24;
/** Per-frame scale in px per metre: image torso length over the world torso's image-plane projection (tilt-corrected). */
export function frameScales(xy: Track, world?: World): number[] {
  return xy.map((f, i) => {
    const sh = f[SH_L], sr = f[SH_R], hl = f[HIP_L], hr = f[HIP_R];
    if ([sh, sr, hl, hr].some((p) => Number.isNaN(p[0]))) return NaN;
    const px = Math.hypot((sh[0] + sr[0]) / 2 - (hl[0] + hr[0]) / 2, (sh[1] + sr[1]) / 2 - (hl[1] + hr[1]) / 2);
    const w = world?.[i];
    if (w) {
      const dx = (w[SH_L][0] + w[SH_R][0]) / 2 - (w[HIP_L][0] + w[HIP_R][0]) / 2;
      const dy = (w[SH_L][1] + w[SH_R][1]) / 2 - (w[HIP_L][1] + w[HIP_R][1]) / 2;
      const m = Math.hypot(dx, dy);
      if (m > 0.12) return px / m;
    }
    return px / 0.45; // typical torso, when no world track
  });
}

/** Scale coefficient across frames: residual of each contact point vs the line, against its frame's scale. */
export function fitScaleTerm(xy: Track, contacts: Contacts, scales: number[], line: { a: number; b: number; c: number }, world?: World): { d: number; s0: number } {
  const rows: [number, number][] = []; // [scale, residual]
  for (const cp of CONTACT_POINTS) {
    const j = CONTACT_JOINT[cp];
    contacts[cp].forEach((on, i) => {
      if (!on) return;
      const p = xy[i][j], s = scales[i];
      if (Number.isNaN(p[0]) || Number.isNaN(s)) return;
      const z = world?.[i] ? world[i]![j][2] : 0;
      rows.push([s, p[1] - (line.a * p[0] + line.b + line.c * z)]);
    });
  }
  const s0 = median(rows.map((r) => r[0]));
  if (!(s0 > 0) || rows.length < 15) return { d: 0, s0: s0 || 1 };
  const sorted = rows.map((r) => r[0]).sort((a, b) => a - b);
  const spread = (sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)]) / s0;
  if (spread < 0.08) return { d: 0, s0 };
  const ratios = rows.filter((r) => Math.abs(r[0] - s0) > 0.04 * s0).map((r) => r[1] / (r[0] - s0));
  if (ratios.length < 10) return { d: 0, s0 };
  // nearer (larger scale) must be lower on screen: d ≥ 0; cap at 3 torso of shift per doubling of scale
  const torsoPx = s0 * 0.45;
  return { d: Math.max(0, Math.min((3 * torsoPx) / s0, median(ratios))), s0 };
}

/** Theil–Sen: median of pairwise slopes, intercept = median(y − a·x). Subsamples pairs for speed. */
export function theilSen(points: XY[], maxPairs = 4000, opts: { minDx?: number; clampSlope?: number } = {}): { a: number; b: number } | null {
  const pts = points.filter((p) => !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
  if (pts.length < 2) return null;
  const n = pts.length;
  const minDx = opts.minDx ?? 1e-6;
  const slopes: number[] = [];
  const total = (n * (n - 1)) / 2;
  if (total <= maxPairs) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const dx = pts[j][0] - pts[i][0]; if (Math.abs(dx) > minDx) slopes.push((pts[j][1] - pts[i][1]) / dx); }
  } else {
    // deterministic stride sampling of pairs
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let k = 0; k < maxPairs * 3 && slopes.length < maxPairs; k++) { const i = Math.floor(rnd() * n), j = Math.floor(rnd() * n); if (i === j) continue; const dx = pts[j][0] - pts[i][0]; if (Math.abs(dx) > minDx) slopes.push((pts[j][1] - pts[i][1]) / dx); }
  }
  if (slopes.length === 0) return { a: 0, b: median(pts.map((p) => p[1])) };
  const a = median(slopes);
  // a floor can't be steep in a reel; clamp to ±35° so a few bad contacts can't tilt it absurdly
  const lim = opts.clampSlope ?? 0.7;
  const aC = Math.max(-lim, Math.min(lim, a));
  const b = median(pts.map((p) => p[1] - aC * p[0]));
  return { a: aC, b };
}

export function contactPoints(xy: Track, contacts: Contacts): XY[] {
  const out: XY[] = [];
  for (const cp of CONTACT_POINTS) { const j = CONTACT_JOINT[cp]; contacts[cp].forEach((on, i) => { if (on) out.push(xy[i][j]); }); }
  return out;
}

/**
 * Depth coefficient (px per metre of hip-relative world z) fitted ACROSS frames from every contact point:
 * residual of the point vs the line against its own z. Owner fixture DfC8LdUIjV4-float: heels 0.5 m nearer
 * than the hands sit 0.6 torso lower, a knee 0.2 m further sits 0.45 torso higher — one straight relation.
 * (The earlier within-frame estimate needed two contacts of different depth in the same frame, which hands
 * or feet in pairs never give.) Nearer must be lower on screen: c ≤ 0, capped at 4 torso per metre.
 */
export function fitDepthTerm(xy: Track, contacts: Contacts, world: World | undefined, line: { a: number; b: number }, torsoPx?: number): number {
  if (!world) return 0;
  const rows: [number, number][] = [];
  for (const cp of CONTACT_POINTS) {
    const j = CONTACT_JOINT[cp];
    contacts[cp].forEach((on, i) => {
      const w = world[i];
      if (!on || !w) return;
      const p = xy[i][j];
      if (Number.isNaN(p[0]) || Number.isNaN(w[j][2])) return;
      rows.push([w[j][2], p[1] - (line.a * p[0] + line.b)]);
    });
  }
  if (rows.length < 12) return 0;
  const zs = rows.map((r) => r[0]).sort((a, b) => a - b);
  const spread = zs[Math.floor(zs.length * 0.9)] - zs[Math.floor(zs.length * 0.1)];
  if (spread < 0.15) return 0;
  // robust slope of residual vs z over pairs at least 0.15 m apart (a median of per-point ratios is pulled
  // towards 0 by the many points near the reference depth)
  // cap: 1.2 torso of image shift per metre of depth — enough for a side view, and MediaPipe's world z is too
  // noisy to trust more (an uncapped fit on the owner's kneeling reel drew heels 1.3 torso under the ground)
  const cap = torsoPx ? 1.2 * torsoPx : 200;
  const ts = theilSen(rows as XY[], 4000, { minDx: 0.15, clampSlope: cap });
  if (!ts) return 0;
  return Math.max(-cap, Math.min(0, ts.a));
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
  if (fit) {
    const torsoPx = median(xy.map((f) => Math.hypot((f[11][0] + f[12][0]) / 2 - (f[23][0] + f[24][0]) / 2, (f[11][1] + f[12][1]) / 2 - (f[23][1] + f[24][1]) / 2)).filter((v) => !Number.isNaN(v)));
    const c = fitDepthTerm(xy, contacts, opts.world, fit, torsoPx);
    // re-centre the line at z = 0 (the torso's depth) once the depth term is known
    let b = fit.b;
    if (c !== 0 && opts.world) {
      const vals: number[] = [];
      for (const cp of CONTACT_POINTS) { const j = CONTACT_JOINT[cp]; contacts[cp].forEach((on, i) => { const w = opts.world![i]; const p = xy[i][j]; if (on && w && !Number.isNaN(p[0])) vals.push(p[1] - fit.a * p[0] - c * w[j][2]); }); }
      if (vals.length) b = median(vals);
    }
    const { d, s0 } = fitScaleTerm(xy, contacts, frameScales(xy, opts.world), { a: fit.a, b, c }, opts.world);
    return { a: fit.a, b, c, d, s0, source: 'contacts', points: pts.length };
  }
  return { a: 0, b: opts.fallbackY ?? median(xy.map((f) => Math.max(f[27][1], f[28][1]))), c: 0, source: 'fallback', points: pts.length };
}

export type PinResult = { xy: Track; offset: number[]; raw: number[] };

/**
 * Root pinning. For each frame with contacts, offset = mean over contact points of (floorY(x) − y)
 * (positive = move down). Frames without contacts keep the previous offset (held), then the series is
 * One-Euro-smoothed and applied to every joint of every frame (vertical only).
 */
export function pinToFloor(xy: Track, contacts: Contacts, floor: Pick<FloorLine, 'a' | 'b' | 'c'>, fps: number, opts: { maxOffsetTorso?: number; torso?: number; minCutoff?: number; beta?: number; /** max offset change per frame, torso lengths */ slewTorso?: number; world?: World } = {}): PinResult {
  const n = xy.length;
  const raw = new Array<number>(n).fill(NaN);
  const fl = floor as Pick<FloorLine, 'a' | 'b' | 'c'> & { d?: number; s0?: number };
  const scales = fl.d && fl.s0 ? frameScales(xy, opts.world) : null;
  // the drawn floor is the line at the reference scale; a frame's contacts sit on the floor at the frame's
  // own scale, so the figure is shifted by the difference (predicted even without contacts)
  const predicted = (i: number) => (scales && fl.d && fl.s0 && !Number.isNaN(scales[i]) ? -fl.d * (scales[i] - fl.s0) : NaN);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    const w = opts.world?.[i];
    for (const cp of CONTACT_POINTS) {
      if (!contacts[cp][i]) continue;
      const j = CONTACT_JOINT[cp];
      const p = xy[i][j];
      if (Number.isNaN(p[0])) continue;
      s += floorYAt({ a: fl.a, b: fl.b, c: fl.c }, p[0], w ? w[j][2] : 0) - p[1];
      c++;
    }
    if (c) raw[i] = s / c;
  }
  // frames without contacts: follow the predicted depth shift plus the typical residual of contact frames;
  // without a scale model, hold the last known offset (and the first known one backwards)
  const held = raw.slice();
  if (scales) {
    const res: number[] = [];
    for (let i = 0; i < n; i++) { const pr = predicted(i); if (!Number.isNaN(raw[i]) && !Number.isNaN(pr)) res.push(raw[i] - pr); }
    const r0 = res.length ? median(res) : NaN;
    if (!Number.isNaN(r0)) for (let i = 0; i < n; i++) { const pr = predicted(i); if (Number.isNaN(held[i]) && !Number.isNaN(pr)) held[i] = pr + r0; }
  }
  let last = NaN;
  for (let i = 0; i < n; i++) { if (!Number.isNaN(held[i])) last = held[i]; else held[i] = last; }
  let first = NaN;
  for (let i = 0; i < n; i++) if (!Number.isNaN(held[i])) { first = held[i]; break; }
  for (let i = 0; i < n && Number.isNaN(held[i]); i++) held[i] = first;
  if (Number.isNaN(first)) return { xy, offset: new Array(n).fill(0), raw };
  // limit how far a frame may be moved (a mis-detected contact must not yank the figure)
  const lim = (opts.maxOffsetTorso ?? 0.6) * (opts.torso ?? 100);
  const clamped = held.map((v) => Math.max(-lim, Math.min(lim, v)));
  // smooth, then limit how fast the offset may change: a contact switch (hands → heels) must not step the
  // whole figure (owner, 2026-11-04: "the figure moves weird"); residual float for a few frames is the lesser evil
  const smoothed = oneEuro(clamped, fps, { minCutoff: opts.minCutoff ?? 0.5, beta: opts.beta ?? 0.01 });
  const slew = (opts.slewTorso ?? 0.03) * (opts.torso ?? 100);
  const offset = smoothed.slice();
  for (let i = 1; i < n; i++) { const d = offset[i] - offset[i - 1]; if (d > slew) offset[i] = offset[i - 1] + slew; else if (d < -slew) offset[i] = offset[i - 1] - slew; }
  const out: Track = xy.map((fr, i) => fr.map((p) => (Number.isNaN(p[0]) ? p : ([p[0], p[1] + offset[i]] as XY))));
  return { xy: out, offset, raw };
}
