import type { RawFrame } from './types';

/**
 * Re-time a variable-rate capture (ReplayKit records at the display rate, e.g. 39 fps) onto a fixed
 * grid by nearest frame. Grid points with no frame within `tolerance` seconds stay "no person".
 */
export function resample(frames: RawFrame[], fps = 30, tolerance = 0.5 / fps + 1e-6): RawFrame[] {
  if (frames.length === 0) return [];
  const t0 = frames[0].t;
  const t1 = frames[frames.length - 1].t;
  const out: RawFrame[] = [];
  let j = 0;
  for (let k = 0; ; k++) {
    const t = t0 + k / fps;
    if (t > t1 + 1e-9) break;
    while (j + 1 < frames.length && Math.abs(frames[j + 1].t - t) <= Math.abs(frames[j].t - t)) j++;
    const f = frames[j];
    out.push(Math.abs(f.t - t) <= tolerance ? { ...f, t } : { t });
  }
  return out;
}

/** Median frame interval → fps (as the prototype did with np.median(np.diff(t))). */
export function estimateFps(frames: RawFrame[]): number {
  const d: number[] = [];
  for (let i = 1; i < frames.length; i++) d.push(frames[i].t - frames[i - 1].t);
  if (d.length === 0) return 30;
  d.sort((a, b) => a - b);
  const m = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
  return m > 0 ? 1 / m : 30;
}
