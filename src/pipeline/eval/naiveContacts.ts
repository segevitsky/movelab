/**
 * Baseline contact proxy for the step-1 harness (replaced by `contacts()` in step 2):
 * a point is "in contact" on a frame when it is within 0.15 torso of the lowest candidate point
 * (largest image y) in that frame AND moves slower than 1.0 torso/s. No hysteresis.
 */
import { hypot2 } from '../math';
import type { Track } from '../types';
import { CONTACT_JOINT, type ContactPoint, type Contacts } from './metrics';

export function naiveContacts(xy: Track, fps: number, torso: number, margin = 0.15, maxSpeed = 1.0): Contacts {
  const n = xy.length;
  const pts = Object.keys(CONTACT_JOINT) as ContactPoint[];
  const out = Object.fromEntries(pts.map((p) => [p, new Array(n).fill(false)])) as Contacts;
  for (let i = 0; i < n; i++) {
    const ys = pts.map((p) => xy[i][CONTACT_JOINT[p]][1]).filter((y) => !Number.isNaN(y));
    if (!ys.length) continue;
    const lowest = Math.max(...ys);
    for (const p of pts) {
      const j = CONTACT_JOINT[p];
      const q = xy[i][j];
      if (Number.isNaN(q[0])) continue;
      const near = lowest - q[1] <= margin * torso;
      const speed = i > 0 && !Number.isNaN(xy[i - 1][j][0]) ? (hypot2(q, xy[i - 1][j]) / torso) * fps : 0;
      out[p][i] = near && speed <= maxSpeed;
    }
  }
  return out;
}
