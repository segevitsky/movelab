/**
 * Phase 14 — the figure seen from a rotated virtual camera (pure). MediaPipe's world track is hip-centred
 * (metres; x right, y down, z nearer < 0), so it knows the body's shape but not where the hips are in the
 * room. The 2D pinned track supplies that: the hips' height above the fitted floor and their horizontal
 * position, in metres via the frame's scale (px per metre of torso). Rotating about the vertical axis by
 * `yawDeg` and projecting orthographically gives a 2D clip that the existing renderer draws as usual —
 * floor line, shadow, feet and depth order included. Nothing is invented: every point is a stored 3D
 * joint, translated to the room and rotated.
 */
import { LM, type FootTrack, type Track, type XY } from '../pipeline/types';
import type { World } from '../pipeline/floor';
import type { FigureClip } from './prepare';

const known = (p: XY | undefined) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const mid = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const median = (xs: number[]) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

/**
 * How frontal the camera is: the image shoulder width over the 3D shoulder width, both in torso units.
 * ≈ 1 facing the camera, ≈ 0 side view. Median over frames with both tracks.
 */
export function facingRatio(xy: Track, world: World): number {
  const vals: number[] = [];
  for (let i = 0; i < xy.length; i++) {
    const f = xy[i], w = world[i];
    if (!w || !known(f[LM.leftShoulder]) || !known(f[LM.rightShoulder]) || !known(f[LM.leftHip]) || !known(f[LM.rightHip])) continue;
    const swImg = Math.hypot(f[LM.leftShoulder][0] - f[LM.rightShoulder][0], f[LM.leftShoulder][1] - f[LM.rightShoulder][1]);
    const sh = mid(f[LM.leftShoulder], f[LM.rightShoulder]), hp = mid(f[LM.leftHip], f[LM.rightHip]);
    const torsoImg = Math.hypot(sh[0] - hp[0], sh[1] - hp[1]);
    const a = w[LM.leftShoulder], b = w[LM.rightShoulder], c = w[LM.leftHip], d = w[LM.rightHip];
    const swW = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const torsoW = Math.hypot((a[0] + b[0]) / 2 - (c[0] + d[0]) / 2, (a[1] + b[1]) / 2 - (c[1] + d[1]) / 2, (a[2] + b[2]) / 2 - (c[2] + d[2]) / 2);
    if (torsoImg > 1 && torsoW > 0.05 && swW > 0.05) vals.push((swImg / torsoImg) / (swW / torsoW));
  }
  return median(vals);
}

export type View3dOptions = {
  /** rotation about the vertical axis, degrees; 0 = as filmed, +35 = three-quarter view from the figure's right */
  yawDeg?: number;
  /** output px per metre (default: keep the 2D clip's scale) */
  pxPerMetre?: number;
  /** output canvas size the clip should fit; the renderer's follow-cam handles the rest */
  width?: number; height?: number;
};

/**
 * Build a 2D clip from the 3D track as seen from a yawed camera. `clip` is the stored 2D (pinned) clip of the
 * same frames: it provides the floor line and the hips' position above it. Frames without 3D stay unknown.
 */
export function clipFromView3d(clip: FigureClip, world: World, opts: View3dOptions = {}): FigureClip {
  const n = Math.min(clip.xy.length, world.length);
  const yaw = ((opts.yawDeg ?? 35) * Math.PI) / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const fl = clip.scene?.floor;
  // scale: px per metre from the torso (2D length vs 3D length), median over frames
  const scales: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = clip.xy[i], w = world[i];
    if (!w || !known(f[LM.leftShoulder]) || !known(f[LM.rightShoulder]) || !known(f[LM.leftHip]) || !known(f[LM.rightHip])) continue;
    const sh = mid(f[LM.leftShoulder], f[LM.rightShoulder]), hp = mid(f[LM.leftHip], f[LM.rightHip]);
    const px = Math.hypot(sh[0] - hp[0], sh[1] - hp[1]);
    const a = w[LM.leftShoulder], b = w[LM.rightShoulder], c = w[LM.leftHip], d = w[LM.rightHip];
    const m = Math.hypot((a[0] + b[0]) / 2 - (c[0] + d[0]) / 2, (a[1] + b[1]) / 2 - (c[1] + d[1]) / 2, (a[2] + b[2]) / 2 - (c[2] + d[2]) / 2);
    if (m > 0.1) scales.push(px / m);
  }
  const s = opts.pxPerMetre ?? median(scales);
  if (!(s > 0)) return { ...clip, xy: clip.xy.map((f) => f.map(() => [NaN, NaN] as XY)) };
  // the drawn floor: horizontal in the rotated view, at a fixed image y; hips placed above it per frame
  const W = opts.width ?? 640, H = opts.height ?? 800;
  const groundY = H * 0.82, centreX = W / 2;
  const xy: Track = [];
  const legsRightNear: boolean[] = [], armsRightNear: boolean[] = [];
  const toes: XY[][] = [], heels: XY[][] = [], toesOk: boolean[][] = [], heelsOk: boolean[][] = [];
  for (let i = 0; i < n; i++) {
    const f = clip.xy[i], w = world[i];
    const hipImg = known(f[LM.leftHip]) && known(f[LM.rightHip]) ? mid(f[LM.leftHip], f[LM.rightHip]) : null;
    if (!w || !hipImg) { xy.push(f.map(() => [NaN, NaN] as XY)); legsRightNear.push(true); armsRightNear.push(true); toes.push([[NaN, NaN], [NaN, NaN]]); heels.push([[NaN, NaN], [NaN, NaN]]); toesOk.push([false, false]); heelsOk.push([false, false]); continue; }
    // hips above the floor (metres) from the pinned 2D track; horizontal drift from the hips' x
    const floorY = fl ? fl.a * hipImg[0] + fl.b : groundY;
    const hipHeight = Math.max(0, floorY - hipImg[1]) / s;
    const hipX = (hipImg[0] - (clip.xy[0] && known(clip.xy[0][LM.leftHip]) ? mid(clip.xy[0][LM.leftHip], clip.xy[0][LM.rightHip])[0] : hipImg[0])) / s;
    const fr: XY[] = new Array(33);
    for (let j = 0; j < 33; j++) {
      const p = w[j];
      if (!p || !Number.isFinite(p[0])) { fr[j] = [NaN, NaN]; continue; }
      // room coords: hip-centred world + hips placed in the room; rotate about the vertical (y) axis
      const x = p[0] + hipX, y = p[1] - hipHeight, z = p[2];
      const xr = x * cy - z * sy;
      fr[j] = [centreX + xr * s, groundY + y * s];
    }
    xy.push(fr);
    // depth after rotation: nearer = smaller rotated z
    const zr = (j: number) => { const p = w[j]; return p && Number.isFinite(p[0]) ? (p[0] + hipX) * sy + p[2] * cy : NaN; };
    const lz = (zr(LM.leftKnee) + zr(LM.leftAnkle)) / 2, rz = (zr(LM.rightKnee) + zr(LM.rightAnkle)) / 2;
    legsRightNear.push(!(Number.isFinite(lz) && Number.isFinite(rz)) || rz <= lz);
    const la = (zr(LM.leftElbow) + zr(LM.leftWrist)) / 2, ra = (zr(LM.rightElbow) + zr(LM.rightWrist)) / 2;
    armsRightNear.push(!(Number.isFinite(la) && Number.isFinite(ra)) || ra <= la);
    const ok = (j: number) => known(fr[j]);
    toes.push([ok(LM.leftToe) ? fr[LM.leftToe] : [NaN, NaN], ok(LM.rightToe) ? fr[LM.rightToe] : [NaN, NaN]]);
    heels.push([ok(LM.leftHeel) ? fr[LM.leftHeel] : [NaN, NaN], ok(LM.rightHeel) ? fr[LM.rightHeel] : [NaN, NaN]]);
    toesOk.push([ok(LM.leftToe), ok(LM.rightToe)]); heelsOk.push([ok(LM.leftHeel), ok(LM.rightHeel)]);
  }
  return {
    fps: clip.fps,
    xy,
    toes: { xy: toes.map(([a, b]) => [known(a) ? a : null, known(b) ? b : null]), ok: toesOk } as FootTrack,
    heels: { xy: heels.map(([a, b]) => [known(a) ? a : null, known(b) ? b : null]), ok: heelsOk } as FootTrack,
    loop: clip.loop,
    scene: { floor: { a: 0, b: groundY } },
    depth: { legsRightNear, armsRightNear },
  };
}
