/**
 * Walls and bars (owner 2026-11-13: "a person doing a handstand on the wall — what should we do to capture that").
 * We never see the wall or the bar; the body tells us where the support surface is, the same way the floor is fitted
 * from heel/toe contacts. Pure, deterministic, tested.
 *
 * - **Wall**: a foot or hand that holds still, well above the floor and not below the hips (feet) / above them
 *   (hands), consistently to one side of the hips and beyond every other joint on that side, while the body leans on
 *   it (feet above the shoulders, a horizontal body with the feet raised, or the shoulders leaning toward it from the
 *   hips), for ≥ `minSeconds` → a wall at that x, the body on the other side (wall handstand, wall walk, wall plank,
 *   leaning push-up). A hand holding a staff out to the side while standing upright (reel 2) passes everything but
 *   the lean. "Off the floor" is judged against a *level* line through the lowest contacts of the clip, not the
 *   fitted floor: with the feet on a wall the fitted floor tilts up to meet them (owner capture 2026-11-17, 19°).
 * - **Bar**: both hands holding still, above the shoulders and level with each other, while the hips swing up and
 *   down beneath them (≥ 0.3 torso of travel, reaching ≥ 1.2 torso below the hands) for ≥ `minSeconds` → a bar
 *   through the hands (pull-ups, leg raises). A standing overhead hold has the same shape but nothing hangs; the
 *   floor cannot tell them apart (hanging feet are "contacts" to the floor fit), the motion can.
 *
 * Everything else (hands on knees, a raised arm, a staff held at the side, an overhead hold while standing) fails one
 * of the tests and draws nothing. When it is wrong the card's equipment tag is the owner's override.
 */
import type { Contacts } from './contacts';
// `contacts` is accepted for future use (hands planted on the floor are never a bar); the rules below use geometry and motion
import { hypot2, median, percentile } from './math';
import { LM, type Track } from './types';

export type Support = {
  wall?: { x: number; bodyLeft: boolean; frames: number };
  bar?: { y: number; x0: number; x1: number; frames: number };
};

export type SupportOptions = {
  /** a point is "holding still" below this speed, torso-lengths / s */
  maxSpeed?: number; // 0.6
  minSeconds?: number; // 1.0
  /** wall: the point must be this far (torso-lengths) to the side of the hips and this far above them */
  wallSide?: number; // 0.35
  wallAbove?: number; // 0.3
  /** off the floor: at least this many torso-lengths above the floor line */
  offFloor?: number; // 0.5
  /** bar: hips at least this far below the hands */
  hang?: number; // 1.2
};

const known = (p: readonly number[] | undefined) => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

function smoothedSpeed(xy: Track, j: number, fps: number, torso: number, win = 5): number[] {
  const n = xy.length;
  const inst = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) { const a = xy[i - 1][j], b = xy[i][j]; if (known(a) && known(b)) inst[i] = (hypot2(a, b) / torso) * fps; }
  if (n > 1) inst[0] = inst[1];
  const h = Math.floor(win / 2);
  const out = new Array<number>(n).fill(Infinity);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - h); k <= Math.min(n - 1, i + h); k++) if (!Number.isNaN(inst[k])) { s += inst[k]; c++; } out[i] = c ? s / c : Infinity; }
  return out;
}

export function detectSupport(xy: Track, _contacts: Contacts, floor: { a: number; b: number }, fps: number, torso: number, opts: SupportOptions = {}): Support {
  const n = xy.length;
  const out: Support = {};
  if (n === 0 || !(torso > 0)) return out;
  const maxSpeed = opts.maxSpeed ?? 0.6;
  const minFrames = Math.max(2, Math.round((opts.minSeconds ?? 1.0) * fps));
  const wallSide = (opts.wallSide ?? 0.35) * torso, wallAbove = (opts.wallAbove ?? 0.3) * torso;
  const offFloor = (opts.offFloor ?? 0.5) * torso, hang = (opts.hang ?? 1.2) * torso;
  // level floor: the lowest hand / foot point of the clip (97th percentile over frames of the per-frame lowest);
  // the fitted line is the fallback when no contact point is known
  const lowest: number[] = [];
  for (const f of xy) { const ys = [LM.leftWrist, LM.rightWrist, LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe].map((j) => f[j]).filter(known).map((p) => p[1]); if (ys.length) lowest.push(Math.max(...ys)); }
  const level = lowest.length ? percentile(lowest, 97) : NaN;
  const floorY = (x: number) => (Number.isFinite(level) ? level : floor.a * x + floor.b);
  const hipX = xy.map((f) => (known(f[LM.leftHip]) && known(f[LM.rightHip]) ? (f[LM.leftHip][0] + f[LM.rightHip][0]) / 2 : NaN));
  const hipY = xy.map((f) => (known(f[LM.leftHip]) && known(f[LM.rightHip]) ? (f[LM.leftHip][1] + f[LM.rightHip][1]) / 2 : NaN));

  // --- wall: one point at a time
  const WALL_POINTS = [LM.leftHeel, LM.rightHeel, LM.leftToe, LM.rightToe, LM.leftAnkle, LM.rightAnkle, LM.leftWrist, LM.rightWrist];
  const wallX: number[] = [], wallSign: number[] = [];
  for (const j of WALL_POINTS) {
    const speed = smoothedSpeed(xy, j, fps, torso);
    let run: number[] = [];
    const flush = () => { if (run.length >= minFrames) for (const i of run) { wallX.push(xy[i][j][0]); wallSign.push(Math.sign(xy[i][j][0] - hipX[i])); } run = []; };
    for (let i = 0; i < n; i++) {
      const p = xy[i][j];
      let ok = known(p) && Number.isFinite(hipX[i]) && speed[i] <= maxSpeed;
      if (ok) {
        const dx = p[0] - hipX[i];
        // the body leans on it: hips well off the floor (a seated flow's raised foot is not a wall); feet may sit
        // at hip height (wall plank), hands must be above the hips
        const isHand = j === LM.leftWrist || j === LM.rightWrist;
        ok = Math.abs(dx) >= wallSide && hipY[i] - p[1] >= (isHand ? wallAbove : -wallAbove) && floorY(p[0]) - p[1] >= offFloor && floorY(hipX[i]) - hipY[i] >= 0.8 * torso;
        if (ok) {
          const shL = xy[i][LM.leftShoulder], shR = xy[i][LM.rightShoulder];
          if (!known(shL) || !known(shR)) ok = false;
          else {
            const shX = (shL[0] + shR[0]) / 2, shY = (shL[1] + shR[1]) / 2;
            const lean = shX - hipX[i];
            // feet: above the shoulders (handstand), or the body horizontal with the feet raised (wall plank), or the
            // body leaning; hands: leaning only (a hand raised to the side above the shoulders — a staff held up — is
            // never a wall; in a handstand the hands are on the floor)
            const leaning = Math.sign(lean) === Math.sign(dx) && Math.abs(lean) >= 0.15 * torso;
            const horizontal = Math.abs(shY - hipY[i]) <= 0.5 * torso;
            ok = leaning || (!isHand && (p[1] < shY || horizontal));
          }
        }
        // beyond every other joint on that side: nothing of the body is past the wall
        if (ok) for (let k = 0; k < 33 && ok; k++) { const q = xy[i][k]; if (k !== j && known(q) && Math.sign(q[0] - p[0]) === Math.sign(dx) && Math.abs(q[0] - p[0]) > 0.15 * torso) ok = false; }
      }
      if (ok) run.push(i); else flush();
    }
    flush();
  }
  if (wallX.length >= minFrames) {
    const pos = wallSign.filter((s) => s > 0).length, neg = wallSign.length - pos;
    const sign = pos >= neg ? 1 : -1, share = Math.max(pos, neg) / wallSign.length;
    const xs = wallX.filter((_, i) => wallSign[i] === sign);
    const x = median(xs);
    const spread = median(xs.map((v) => Math.abs(v - x)));
    if (share >= 0.85 && spread <= 0.15 * torso && xs.length >= minFrames) out.wall = { x, bodyLeft: sign > 0, frames: xs.length };
  }

  // --- bar: both hands together
  const sL = smoothedSpeed(xy, LM.leftWrist, fps, torso), sR = smoothedSpeed(xy, LM.rightWrist, fps, torso);
  const barFrames: number[] = [];
  let run: number[] = [];
  const flushBar = () => {
    if (run.length >= minFrames) {
      const drop = run.map((i) => hipY[i] - (xy[i][LM.leftWrist][1] + xy[i][LM.rightWrist][1]) / 2);
      const hips = run.map((i) => hipY[i]);
      if (Math.max(...drop) >= hang && Math.max(...hips) - Math.min(...hips) >= 0.3 * torso) barFrames.push(...run);
    }
    run = [];
  };
  for (let i = 0; i < n; i++) {
    const f = xy[i], l = f[LM.leftWrist], r = f[LM.rightWrist], shL = f[LM.leftShoulder], shR = f[LM.rightShoulder];
    let ok = known(l) && known(r) && known(shL) && known(shR) && Number.isFinite(hipY[i]) && sL[i] <= maxSpeed && sR[i] <= maxSpeed;
    if (ok) {
      const handY = (l[1] + r[1]) / 2, shY = (shL[1] + shR[1]) / 2;
      ok = Math.abs(l[1] - r[1]) <= 0.3 * torso && shY - handY >= 0.2 * torso && hipY[i] - handY >= 0.6 * torso;
    }
    if (ok) run.push(i); else flushBar();
  }
  flushBar();
  if (barFrames.length >= minFrames) {
    const ys = barFrames.map((i) => (xy[i][LM.leftWrist][1] + xy[i][LM.rightWrist][1]) / 2);
    const xl = barFrames.map((i) => Math.min(xy[i][LM.leftWrist][0], xy[i][LM.rightWrist][0]));
    const xr = barFrames.map((i) => Math.max(xy[i][LM.leftWrist][0], xy[i][LM.rightWrist][0]));
    out.bar = { y: median(ys), x0: median(xl), x1: median(xr), frames: barFrames.length };
  }
  return out;
}
