/**
 * Draw one prepared frame onto a Skia canvas, in the style of reference/pose-pipeline/render.py
 * (figure style v4): right side dark, left side grey — fixed; capsule torso, round head; tapered limbs,
 * front limbs outlined in the background colour; feet as ankle–heel–toe triangles only when detected;
 * perspective floor + cast shadow. Draws only what was detected.
 */
import { PaintStyle, Skia, StrokeCap, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import { LM, type XY } from '../pipeline/types';
import { HEAD, projectToFloor, type Prepared, type PreparedFrame } from './prepare';

export const COLORS = {
  bg: '#f6f3ee',
  near: '#1c202c', // right side (even indices)
  far: '#808696', // left side (odd indices)
  torso: '#2b3142',
  floor: '#e9e4db',
  floorLine: '#dad3c7',
  horizon: '#ded8ce',
  shadow: '#d4ccbf',
  shadowOnMat: 'rgba(90, 82, 70, 0.30)',
  mat: '#d9d1c3',
  matRim: '#c9c0b1',
  accent: '#2f6b8f',
} as const;

type Side = { sh: number; el: number; wr: number; hp: number; kn: number; an: number; idx: 0 | 1 };
const LEFT: Side = { sh: LM.leftShoulder, el: LM.leftElbow, wr: LM.leftWrist, hp: LM.leftHip, kn: LM.leftKnee, an: LM.leftAnkle, idx: 0 };
const RIGHT: Side = { sh: LM.rightShoulder, el: LM.rightElbow, wr: LM.rightWrist, hp: LM.rightHip, kn: LM.rightKnee, an: LM.rightAnkle, idx: 1 };

const paintCache = new Map<string, SkPaint>();
function fill(color: string): SkPaint {
  const key = `f:${color}`;
  let p = paintCache.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(Skia.Color(color));
    p.setStyle(PaintStyle.Fill);
    paintCache.set(key, p);
  }
  return p;
}
function stroke(color: string, width: number): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(Math.max(1, width));
  p.setStrokeCap(StrokeCap.Round);
  return p;
}

export type DrawOptions = {
  mirror?: boolean;
  floor?: boolean;
  shadow?: boolean;
  background?: boolean;
};

export function drawFrame(canvas: SkCanvas, prep: Prepared, k: number, opts: DrawOptions = {}) {
  const fr = prep.frames[Math.max(0, Math.min(prep.frames.length - 1, k))];
  const { width: W, height: H, ground } = prep;
  const { x0, y0, scale } = fr.cam;
  const t = prep.th * scale;
  const T = (p: XY): XY => [(p[0] - x0) * scale, (p[1] - y0) * scale];
  const P = fr.p;

  if (opts.background !== false) canvas.drawRect(Skia.XYWHRect(0, 0, W, H), fill(COLORS.bg));
  canvas.save();
  if (opts.mirror) {
    canvas.translate(W, 0);
    canvas.scale(-1, 1);
  }

  // --- floor: horizon + grid receding to a vanishing point
  const gy = (ground - y0) * scale;
  const hy = gy - H * 0.2;
  const vx = W / 2;
  if (opts.floor !== false) {
    canvas.drawRect(Skia.XYWHRect(0, hy, W, H - hy), fill(COLORS.floor));
    const lp = stroke(COLORS.floorLine, t * 0.16);
    for (let i = -6; i <= 6; i++) {
      const xb = vx + i * W * 0.3;
      canvas.drawLine(vx + (xb - vx) * 0.02, hy, vx + (xb - vx) * 2.2, H * 1.1, lp);
    }
    for (let j = 1; j < 8; j++) {
      const yy = hy + (H * 1.1 - hy) * Math.pow(j / 7, 1.8);
      canvas.drawLine(0, yy, W, yy, lp);
    }
    canvas.drawLine(0, hy, W, hy, stroke(COLORS.horizon, t * 0.15));
  }

  const ok = (p: XY | null | undefined): p is XY => !!p && !Number.isNaN(p[0]) && !Number.isNaN(p[1]);
  const capsule = (a: XY, b: XY, color: string, w: number) => {
    if (!ok(a) || !ok(b)) return;
    const A = T(a);
    const B = T(b);
    canvas.drawLine(A[0], A[1], B[0], B[1], stroke(color, w));
  };
  const dot = (p: XY, r: number, color: string) => { if (!ok(p)) return; const q = T(p); canvas.drawCircle(q[0], q[1], r, fill(color)); };

  // --- floor mat (Arch §5a): flat perspective slab in source pixels, under the figure
  const quad = prep.matQuad;
  if (quad && opts.floor !== false) {
    const pts = quad.map((p) => { const q = T(p); return { x: q[0], y: q[1] }; });
    const path = Skia.Path.Polygon(pts, true);
    canvas.drawPath(path, fill(COLORS.mat));
    canvas.drawPath(path, stroke(COLORS.matRim, Math.max(1, t * 0.12)));
  }

  // --- cast shadow (translucent when there is a mat so it reads on both surfaces)
  if (opts.shadow !== false) {
    const shadowColor = quad ? COLORS.shadowOnMat : COLORS.shadow;
    const sc = (a: XY, b: XY, w: number) => capsule(projectToFloor(a, ground), projectToFloor(b, ground), shadowColor, w);
    const bones: [number, number][] = [
      [LM.leftShoulder, LM.leftElbow], [LM.leftElbow, LM.leftWrist], [LM.rightShoulder, LM.rightElbow], [LM.rightElbow, LM.rightWrist],
      [LM.leftHip, LM.leftKnee], [LM.leftKnee, LM.leftAnkle], [LM.rightHip, LM.rightKnee], [LM.rightKnee, LM.rightAnkle],
      [LM.leftShoulder, LM.rightShoulder], [LM.leftHip, LM.rightHip],
    ];
    for (const [a, b] of bones) sc(P[a], P[b], t * 0.9);
    const ms = mid(P[LM.leftShoulder], P[LM.rightShoulder]);
    const mh = mid(P[LM.leftHip], P[LM.rightHip]);
    sc(ms, mh, t * 1.7);
    if (ok(P[HEAD]) && ok(ms) && ok(mh)) {
      const hs = T(projectToFloor(P[HEAD], ground));
      const r0 = Math.hypot(ms[0] - mh[0], ms[1] - mh[1]) * 0.24 * scale;
      canvas.drawOval(Skia.XYWHRect(hs[0] - r0, hs[1] - r0 * 0.8, 2 * r0, 1.6 * r0), fill(shadowColor));
    }
  }

  const taper = (a: XY, b: XY, color: string, w1: number, w2: number) => {
    if (!ok(a) || !ok(b)) return;
    const A = T(a);
    const B = T(b);
    const vx_ = B[0] - A[0];
    const vy_ = B[1] - A[1];
    const n = Math.hypot(vx_, vy_);
    if (n < 1) { capsule(a, b, color, w1); return; }
    const px = -vy_ / n;
    const py = vx_ / n;
    const path = Skia.Path.Polygon(
      [
        { x: A[0] + px * w1 / 2, y: A[1] + py * w1 / 2 },
        { x: B[0] + px * w2 / 2, y: B[1] + py * w2 / 2 },
        { x: B[0] - px * w2 / 2, y: B[1] - py * w2 / 2 },
        { x: A[0] - px * w1 / 2, y: A[1] - py * w1 / 2 },
      ],
      true,
    );
    const f = fill(color);
    canvas.drawPath(path, f);
    canvas.drawCircle(A[0], A[1], w1 / 2, f);
    canvas.drawCircle(B[0], B[1], w2 / 2, f);
  };

  const limbSet = (s: Side, color: string, grow = 0) => {
    const g = grow;
    taper(P[s.sh], P[s.el], color, t * 1.0 + g, t * 0.95 + g);
    taper(P[s.el], P[s.wr], color, t * 0.95 + g, t * 0.85 + g);
    dot(P[s.wr], t * 0.6 + g / 2, color);
    taper(P[s.hp], P[s.kn], color, t * 1.1 + g, t * 1.0 + g);
    taper(P[s.kn], P[s.an], color, t * 1.0 + g, t * 0.9 + g);
    dot(P[s.an], (t * 0.85 + g) * 0.62, color);
    const toe = fr.toe[s.idx];
    const heel = fr.heel[s.idx];
    if (toe && ok(P[s.an])) {
      if (heel) {
        const A = T(P[s.an]);
        const Hh = T(heel);
        const Tt = T(toe);
        const path = Skia.Path.Polygon([{ x: A[0], y: A[1] }, { x: Hh[0], y: Hh[1] }, { x: Tt[0], y: Tt[1] }], true);
        canvas.drawPath(path, fill(color));
        capsule(heel, toe, color, t * 0.55 + g);
        capsule(P[s.an], heel, color, t * 0.7 + g);
      }
      taper(P[s.an], toe, color, t * 0.85 + g, t * 0.5 + g);
    }
  };

  // far side (left, grey) first
  limbSet(LEFT, COLORS.far);

  // torso: spine capsule, shoulder + hip bars, neck, head
  const ms = mid(P[LM.leftShoulder], P[LM.rightShoulder]);
  const mh = mid(P[LM.leftHip], P[LM.rightHip]);
  const spx = ms[0] - mh[0];
  const spy = ms[1] - mh[1];
  const L = Math.hypot(spx, spy) + 1e-6;
  const u: XY = [spx / L, spy / L];
  capsule(ms, mh, COLORS.torso, t * 1.9);
  capsule(P[LM.leftShoulder], P[LM.rightShoulder], COLORS.torso, t * 1.1);
  capsule(P[LM.leftHip], P[LM.rightHip], COLORS.torso, t * 1.2);
  const hc = P[HEAD];
  const hr = L * 0.24;
  const dh = Math.hypot(hc[0] - ms[0], hc[1] - ms[1]) + 1e-6;
  const neckEnd: XY = [hc[0] - ((hc[0] - ms[0]) / dh) * hr * 0.8, hc[1] - ((hc[1] - ms[1]) / dh) * hr * 0.8];
  capsule([ms[0] + u[0] * prep.th * 0.2, ms[1] + u[1] * prep.th * 0.2], neckEnd, COLORS.torso, t * 0.9);
  if (ok(hc)) { const C = T(hc); canvas.drawCircle(C[0], C[1], hr * scale, fill(COLORS.torso)); }

  // near side (right, dark) with a background outline
  limbSet(RIGHT, COLORS.bg, t * 0.55);
  limbSet(RIGHT, COLORS.near);

  canvas.restore();
}

function mid(a: XY, b: XY): XY {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** Record every frame of a prepared clip as a Skia picture (cheap to replay on the UI thread). */
export function recordPictures(prep: Prepared, opts: DrawOptions = {}, onlyFrame?: number) {
  const rec = Skia.PictureRecorder();
  const out = [];
  if (onlyFrame !== undefined) {
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, prep.width, prep.height));
    drawFrame(canvas, prep, onlyFrame, opts);
    out.push(rec.finishRecordingAsPicture());
    return out;
  }
  for (let k = 0; k < prep.frames.length; k++) {
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, prep.width, prep.height));
    drawFrame(canvas, prep, k, opts);
    out.push(rec.finishRecordingAsPicture());
  }
  return out;
}
