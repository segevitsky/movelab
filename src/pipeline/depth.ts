/**
 * Phase 2.5 step 5 — depth order from 3D. Per limb pair, which side is nearer the camera from the world
 * z of the knees (legs) / elbows (arms): smaller z = nearer. Smoothed (rolling median) with 6-frame
 * hysteresis so the draw order doesn't flicker. This is depth from 3D — not near/far colouring from
 * confidence (which failed before). Side colours stay fixed; only the draw order / width change.
 */
import { median } from './math';
import { LM } from './types';
import type { World } from './floor';

export type DepthOrder = { legsRightNear: boolean[]; armsRightNear: boolean[] };

function smoothSign(diff: number[], win: number, hyst: number): boolean[] {
  const n = diff.length;
  const h = Math.floor(win / 2);
  const med = diff.map((_, i) => { const s: number[] = []; for (let k = Math.max(0, i - h); k <= Math.min(n - 1, i + h); k++) if (!Number.isNaN(diff[k])) s.push(diff[k]); return s.length ? median(s) : NaN; });
  const out = new Array<boolean>(n).fill(true);
  let state = true; // right nearer by default (matches the fixed render order before this step)
  let first = med.findIndex((v) => !Number.isNaN(v));
  if (first >= 0) state = med[first] > 0;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const v = med[i];
    const want = Number.isNaN(v) ? state : v > 0;
    if (want !== state) { run++; if (run >= hyst) { state = want; run = 0; for (let k = i - hyst + 1; k < i; k++) if (k >= 0) out[k] = state; } }
    else run = 0;
    out[i] = state;
  }
  return out;
}

/** true = right side nearer the camera (draw it last / on top). */
export function depthOrder(world: World, opts: { window?: number; hysteresis?: number } = {}): DepthOrder {
  const win = opts.window ?? 5;
  const hyst = opts.hysteresis ?? 6;
  const legs = world.map((w) => (w ? w[LM.leftKnee][2] - w[LM.rightKnee][2] : NaN)); // > 0 → right nearer
  const arms = world.map((w) => (w ? w[LM.leftElbow][2] - w[LM.rightElbow][2] : NaN));
  return { legsRightNear: smoothSign(legs, win, hyst), armsRightNear: smoothSign(arms, win, hyst) };
}
