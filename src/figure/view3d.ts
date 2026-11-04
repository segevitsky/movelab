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

/** joints that can rest on the ground (same group as the 2D contacts): feet, knees, hands */
const GROUND = [LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe, LM.leftAnkle, LM.rightAnkle, LM.leftKnee, LM.rightKnee, LM.leftWrist, LM.rightWrist];

/**
 * MediaPipe's world axes are the camera's, and a reel of floor work is filmed looking down (owner fixtures:
 * 17–22°), so "vertical" in the track is tilted and a shin lying on the mat would dive into the ground once
 * rotated. Fit the floor plane y = a·x + b·z + c to the lowest joints of every frame (within 5 cm of the lowest),
 * least squares, and return the camera's pitch and roll (radians). NaN when there are too few points.
 */
export type FloorPlane = { a: number; b: number; c: number; pitch: number; roll: number; points: number };
export function floorPlane(world: World): FloorPlane {
  let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sxy = 0, szy = 0, sy = 0, m = 0;
  for (const f of world) {
    if (!f) continue;
    const ps = GROUND.map((j) => f[j]).filter((p) => p && Number.isFinite(p[1]));
    if (!ps.length) continue;
    const lo = Math.max(...ps.map((p) => p[1]));
    for (const [x, y, z] of ps) if (lo - y < 0.05) { sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; sxy += x * y; szy += z * y; sy += y; m++; }
  }
  if (m < 20) return { a: NaN, b: NaN, c: NaN, pitch: NaN, roll: NaN, points: m };
  // solve [sxx sxz sx; sxz szz sz; sx sz m]·[a b c] = [sxy szy sy] (Gaussian elimination)
  const M = [[sxx, sxz, sx, sxy], [sxz, szz, sz, szy], [sx, sz, m, sy]];
  for (let i = 0; i < 3; i++) {
    let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-9) return { a: NaN, b: NaN, c: NaN, pitch: NaN, roll: NaN, points: m };
    for (let r = 0; r < 3; r++) { if (r === i) continue; const f = M[r][i] / M[i][i]; for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c]; }
  }
  const a = M[0][3] / M[0][0], b = M[1][3] / M[1][1], c = M[2][3] / M[2][2];
  return { a, b, c, pitch: Math.atan(b), roll: Math.atan(a), points: m };
}

/**
 * Rotate the world so the fitted floor plane is horizontal: the plane's up normal (a, −1, b) — y is down — is
 * turned onto (0, −1, 0) by one rotation about their common perpendicular (Rodrigues). Pure: new arrays.
 */
export function levelWorld(world: World, plane = floorPlane(world)): World {
  if (!Number.isFinite(plane.a) || !Number.isFinite(plane.b)) return world;
  const ul = Math.hypot(plane.a, 1, plane.b);
  const u = [plane.a / ul, -1 / ul, plane.b / ul]; // current up
  const t = [0, -1, 0]; // wanted up
  const k = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]]; // u × t
  const kl = Math.hypot(k[0], k[1], k[2]);
  if (kl < 1e-6) return world;
  const kx = k[0] / kl, ky = k[1] / kl, kz = k[2] / kl;
  const cos = Math.max(-1, Math.min(1, u[0] * t[0] + u[1] * t[1] + u[2] * t[2])), sin = kl;
  return world.map((f) => f && f.map((p) => {
    if (!p || !Number.isFinite(p[0])) return p;
    const [x, y, z] = p;
    const kd = kx * x + ky * y + kz * z;
    const cx = ky * z - kz * y, cy = kz * x - kx * z, cz = kx * y - ky * x; // k × p
    return [x * cos + cx * sin + kx * kd * (1 - cos), y * cos + cy * sin + ky * kd * (1 - cos), z * cos + cz * sin + kz * kd * (1 - cos)] as [number, number, number];
  }));
}

/** Level until the refitted plane is flat: the lowest-joint set shifts after each rotation, so 3–4 passes are needed. */
export function levelFloor(world: World, passes = 4): { world: World; plane: FloorPlane } {
  let w = world, plane = floorPlane(w);
  for (let i = 0; i < passes && Number.isFinite(plane.a); i++) {
    w = levelWorld(w, plane);
    const next = floorPlane(w);
    if (!Number.isFinite(next.a) || (Math.abs(next.pitch) < 0.01 && Math.abs(next.roll) < 0.01)) break;
    plane = next;
  }
  return { world: w, plane };
}

export type View3dOptions = {
  /** rotation about the vertical axis, degrees; 0 = as filmed, +35 = three-quarter view from the figure's right */
  yawDeg?: number;
  /** output px per metre (default: keep the 2D clip's scale) */
  pxPerMetre?: number;
  /** output canvas size the clip should fit; the renderer's follow-cam handles the rest */
  width?: number; height?: number;
  /** level the floor plane fitted from the contact joints before rotating (default true) */
  level?: boolean;
};

/**
 * Build a 2D clip from the 3D track as seen from a yawed camera. `clip` is the stored 2D (pinned) clip of the
 * same frames: it provides the floor line and the hips' position above it. Frames without 3D stay unknown.
 */
export function clipFromView3d(clip: FigureClip, rawWorld: World, opts: View3dOptions = {}): FigureClip {
  const world = opts.level === false ? rawWorld : levelFloor(rawWorld).world;
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
  // the hips' height above the ground: the figure rests on its lowest joint (feet, knees or hands), smoothed over
  // ±0.25 s by a median so a noisy frame cannot lift or sink it; frames without ground joints fall back to the 2D track
  const lowest = world.slice(0, n).map((w) => { if (!w) return NaN; const ys = GROUND.map((j) => w[j]).filter((p) => p && Number.isFinite(p[1])).map((p) => p[1]); return ys.length ? Math.max(...ys) : NaN; });
  const half = Math.max(1, Math.round(clip.fps * 0.25));
  const hipHeight3d = lowest.map((_, i) => median(lowest.slice(Math.max(0, i - half), i + half + 1)));
  const xy: Track = [];
  const legsRightNear: boolean[] = [], armsRightNear: boolean[] = [];
  const toes: XY[][] = [], heels: XY[][] = [], toesOk: boolean[][] = [], heelsOk: boolean[][] = [];
  for (let i = 0; i < n; i++) {
    const f = clip.xy[i], w = world[i];
    const hipImg = known(f[LM.leftHip]) && known(f[LM.rightHip]) ? mid(f[LM.leftHip], f[LM.rightHip]) : null;
    if (!w || !hipImg) { xy.push(f.map(() => [NaN, NaN] as XY)); legsRightNear.push(true); armsRightNear.push(true); toes.push([[NaN, NaN], [NaN, NaN]]); heels.push([[NaN, NaN], [NaN, NaN]]); toesOk.push([false, false]); heelsOk.push([false, false]); continue; }
    // hips above the floor (metres) from the pinned 2D track; horizontal drift from the hips' x
    const floorY = fl ? fl.a * hipImg[0] + fl.b : groundY;
    const hipHeight = Number.isFinite(hipHeight3d[i]) ? hipHeight3d[i] : Math.max(0, floorY - hipImg[1]) / s;
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
