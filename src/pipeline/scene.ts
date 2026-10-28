/** Arch §5a sanity check: a floor mat must be a floor-sized patch under the figure, never a wall. */
import { median, percentile } from './math';
import { torsoLengths } from './clean';
import { LM, type Track, type XY } from './types';

export type MatQuad = [XY, XY, XY, XY];

export function validateMatQuad(quad: XY[] | undefined, xy: Track): MatQuad | undefined {
  if (!quad || quad.length !== 4 || xy.length === 0) return undefined;
  const torso = median(torsoLengths(xy));
  if (!(torso > 0)) return undefined;
  const ground = percentile(xy.map((f) => Math.max(f[LM.leftAnkle][1], f[LM.rightAnkle][1])), 97);
  const hipY = median(xy.map((f) => (f[LM.leftHip][1] + f[LM.rightHip][1]) / 2));
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = bottom - top;
  // must lie on the floor: top edge not above the hips, bottom near or below the ankles
  if (top < hipY) return undefined;
  if (bottom < ground - torso * 0.5) return undefined;
  // floor-like shape: wider than tall-ish, and not taller than ~2 torsos (perspective foreshortening)
  if (height > torso * 2.2) return undefined;
  if (width < torso * 0.8) return undefined;
  return [quad[0], quad[1], quad[2], quad[3]] as MatQuad;
}
