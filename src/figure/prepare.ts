/**
 * Pure geometry for the stick figure (port of the camera / ground / head / shadow parts of
 * reference/pose-pipeline/render.py). No Skia here, so it is unit-testable.
 */
import { hypot2, median, percentile, savgol } from '../pipeline/math';
import { LM, type FootTrack, type Track, type XY } from '../pipeline/types';

export type FigureClip = {
  fps: number;
  /** cleaned joints [frame][33] px */
  xy: Track;
  toes?: FootTrack;
  heels?: FootTrack;
  /** optional loop window (frame indices, inclusive) — cards loop this; default whole clip */
  loop?: { i0: number; i1: number };
  /** optional HUD: two joints with per-frame angles in degrees */
  hud?: { name: string; angles: number[] }[];
};

export type PreparedFrame = {
  /** 33 joints + head centre at index 33, px (source space) */
  p: XY[];
  toe: (XY | null)[]; // [left, right]
  heel: (XY | null)[];
  cam: { x0: number; y0: number; scale: number };
};

export type Prepared = {
  width: number;
  height: number;
  fps: number;
  /** torso length (px, source space) */
  torso: number;
  /** thickness unit (px, source space) = torso × 0.12 */
  th: number;
  ground: number;
  frames: PreparedFrame[];
  loop: { i0: number; i1: number };
};

export const HEAD = 33;

const mid = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Savitzky–Golay smoothing that degrades gracefully on short clips (render.py `sm`). */
export function smoothSeries(x: number[], fps: number, sec: number, order = 2): number[] {
  let w = Math.floor(fps * sec) | 1;
  if (w >= x.length) w = (x.length - 1) % 2 === 1 ? x.length - 1 : x.length - 2;
  return w > order + 1 ? savgol(x, w, order) : x.slice();
}

/**
 * Pre-compute everything the drawer needs for a given viewport: steady head centre, ground line,
 * follow-cam (constant scale per clip, smoothed horizontal centre, ground anchored at 87 % height).
 */
export function prepare(clip: FigureClip, width: number, height: number): Prepared {
  const { xy, fps } = clip;
  const n = xy.length;
  const ms = xy.map((f) => mid(f[LM.leftShoulder], f[LM.rightShoulder]));
  const mh = xy.map((f) => mid(f[LM.leftHip], f[LM.rightHip]));
  const torso = median(ms.map((s, i) => hypot2(s, mh[i])));
  const th = torso * 0.12;

  // steady head centre: between the neck extension and the face centre, smoothed 0.5 s
  const hcRaw = xy.map((f, i) => {
    const sp: XY = [ms[i][0] - mh[i][0], ms[i][1] - mh[i][1]];
    const L = Math.hypot(sp[0], sp[1]) + 1e-6;
    const u: XY = [sp[0] / L, sp[1] / L];
    const face: XY = [(f[LM.nose][0] * 2 + f[LM.leftEye][0] + f[LM.rightEye][0]) / 4, (f[LM.nose][1] * 2 + f[LM.leftEye][1] + f[LM.rightEye][1]) / 4];
    return [((ms[i][0] + u[0] * torso * 0.42) + face[0]) / 2, ((ms[i][1] + u[1] * torso * 0.42) + face[1]) / 2] as XY;
  });
  const hx = smoothSeries(hcRaw.map((p) => p[0]), fps, 0.5);
  const hy = smoothSeries(hcRaw.map((p) => p[1]), fps, 0.5);

  // ground: 97th percentile of the lower ankle, plus a little
  const ground = percentile(xy.map((f) => Math.max(f[LM.leftAnkle][1], f[LM.rightAnkle][1])), 97) + th * 1.1;

  // extents per frame (joints + head + feet) for the camera
  const pts: XY[][] = xy.map((f, i) => {
    const arr: XY[] = [...f.slice(0, 33), [hx[i], hy[i]]];
    for (const ft of [clip.toes, clip.heels]) {
      if (!ft) continue;
      for (const p of ft.xy[i]) if (p) arr.push(p);
    }
    return arr;
  });
  const ext = pts.map((a) => Math.max(...a.map((p) => p[0])) - Math.min(...a.map((p) => p[0])));
  const hgt = pts.map((a) => ground - (Math.min(...a.map((p) => p[1])) - torso * 0.3));
  const scale = Math.min((0.9 * width) / percentile(ext.map((e) => e + torso * 0.6), 98), (0.82 * height) / percentile(hgt, 99));
  const cxRaw = xy.map((f, i) => {
    const xs = [...f.slice(0, 33).map((p) => p[0]), hx[i]];
    return (Math.max(...xs) + Math.min(...xs)) / 2;
  });
  const cx = smoothSeries(cxRaw, fps, 2.0);

  const frames: PreparedFrame[] = xy.map((f, i) => ({
    p: [...f.map((p) => [p[0], p[1]] as XY), [hx[i], hy[i]]],
    toe: clip.toes ? clip.toes.xy[i].map((p) => (p ? ([p[0], p[1]] as XY) : null)) : [null, null],
    heel: clip.heels ? clip.heels.xy[i].map((p) => (p ? ([p[0], p[1]] as XY) : null)) : [null, null],
    cam: { x0: cx[i] - width / (2 * scale), y0: ground - (0.87 * height) / scale, scale },
  }));

  return { width, height, fps, torso, th, ground, frames, loop: clip.loop ?? { i0: 0, i1: n - 1 } };
}

/** Shadow projection: light from front-left, high. Point → floor (render.py `proj`). */
export function projectToFloor(p: XY, ground: number): XY {
  const h = ground - p[1];
  return [p[0] + h * 0.32, ground - h * 0.2];
}
