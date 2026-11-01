/**
 * Offline fit of the alike score on the owner's verdicts (Phase 12 calibration).
 *   npx tsx scripts/fit-alike.ts ~/Downloads/similar-verdicts.json
 * Reads the verdict payload (pairs + the drills' skeletons), recomputes fingerprints, per-part distances
 * and a sequence (DTW) distance, then searches weights/scale that agree best with the verdicts.
 */
import fs from 'node:fs';
import { decodeClip, fromBase64 } from '../src/figure/codec';
import { components, fingerprint, type Components, type Fingerprint } from '../src/similarity/fingerprint';
import { LM, MP2COCO, type XY } from '../src/pipeline/types';
import type { FigureClip } from '../src/figure/prepare';

const file = process.argv[2];
if (!file) { console.error('usage: tsx scripts/fit-alike.ts <similar-verdicts.json>'); process.exit(1); }
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!d.exercises) { console.error('this verdict file has no skeletons — re-share from the calibration screen'); process.exit(1); }

const clips = new Map<string, FigureClip>();
for (const e of d.exercises) if (e.figure) { try { clips.set(e.id, decodeClip(fromBase64(e.figure))); } catch {} }
const fps = new Map<string, Fingerprint | null>();
for (const [id, c] of clips) fps.set(id, fingerprint(c));

/** Normalised pose sequence over the loop: hip-centred, torso-scaled, COCO joints, resampled to n frames. */
function sequence(c: FigureClip, n = 32, mirror = false): number[][] | null {
  const i0 = c.loop?.i0 ?? 0, i1 = c.loop?.i1 ?? c.xy.length - 1;
  const frames = c.xy.slice(i0, i1 + 1);
  if (frames.length < 4) return null;
  const out: number[][] = [];
  for (let k = 0; k < n; k++) {
    const f = frames[Math.min(frames.length - 1, Math.round((k / (n - 1)) * (frames.length - 1)))];
    const hip: XY = [(f[LM.leftHip][0] + f[LM.rightHip][0]) / 2, (f[LM.leftHip][1] + f[LM.rightHip][1]) / 2];
    const sh: XY = [(f[LM.leftShoulder][0] + f[LM.rightShoulder][0]) / 2, (f[LM.leftShoulder][1] + f[LM.rightShoulder][1]) / 2];
    const T = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) || 1;
    const v: number[] = [];
    for (const j of MP2COCO) { const p = f[j]; const okp = p && Number.isFinite(p[0]); v.push(okp ? ((mirror ? -1 : 1) * (p[0] - hip[0])) / T : 0, okp ? (p[1] - hip[1]) / T : 0); }
    out.push(v);
  }
  return out;
}
function dtw(a: number[][], b: number[][]): number {
  const n = a.length, m = b.length;
  const D = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  D[0][0] = 0;
  const cost = (x: number[], y: number[]) => { let s = 0; for (let i = 0; i < x.length; i += 2) s += Math.hypot(x[i] - y[i], x[i + 1] - y[i + 1]); return s / (x.length / 2); };
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = cost(a[i - 1], b[j - 1]) + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
  return D[n][m] / (n + m);
}
/** best over the loop phase (circular shift) and mirroring */
function seqDistance(ca: FigureClip, cb: FigureClip): number {
  const A = sequence(ca); if (!A) return 1;
  let best = Infinity;
  for (const mirror of [false, true]) {
    const B = sequence(cb, 32, mirror); if (!B) return 1;
    for (let shift = 0; shift < 32; shift += 4) best = Math.min(best, dtw(A, [...B.slice(shift), ...B.slice(0, shift)]));
  }
  return Math.min(1, best / 0.6); // ≈ 0.6 torso of mean joint offset = "nothing alike"
}

type Row = { a: string; b: string; y: 1 | 0; c: Components; seq: number; old: number };
const rows: Row[] = [];
for (const p of d.pairs) {
  if (!p.verdict) continue;
  const fa = fps.get(p.aId), fb = fps.get(p.bId), ca = clips.get(p.aId), cb = clips.get(p.bId);
  if (!fa || !fb || !ca || !cb) continue;
  rows.push({ a: p.a, b: p.b, y: p.verdict === 'yes' ? 1 : 0, c: components(fa, fb), seq: seqDistance(ca, cb), old: p.score });
}
console.log(`${rows.length} labelled pairs, ${rows.filter((r) => r.y).length} alike`);

const keys = [...(Object.keys(rows[0].c) as (keyof Components)[]), 'seq'] as const;
const dist = (r: Row, w: number[]) => keys.reduce((s, k, i) => s + w[i] * (k === 'seq' ? r.seq : r.c[k]), 0);
/** AUC of "lower distance = alike" */
function auc(w: number[]) {
  const pos = rows.filter((r) => r.y).map((r) => dist(r, w)), neg = rows.filter((r) => !r.y).map((r) => dist(r, w));
  let s = 0; for (const p of pos) for (const n of neg) s += p < n ? 1 : p === n ? 0.5 : 0;
  return s / (pos.length * neg.length);
}
function bestCut(w: number[]) {
  const ds = rows.map((r) => ({ d: dist(r, w), y: r.y })).sort((a, b) => a.d - b.d);
  let best = { cut: 0, acc: 0, fa: 0, miss: 0 };
  for (let i = 0; i <= ds.length; i++) {
    const cut = i < ds.length ? ds[i].d : Infinity;
    const acc = ds.filter((x) => (x.y === 1) === (x.d < cut)).length / ds.length;
    if (acc > best.acc) best = { cut, acc, fa: ds.filter((x) => !x.y && x.d < cut).length, miss: ds.filter((x) => x.y && x.d >= cut).length };
  }
  return best;
}
// single-feature AUCs
console.log('\nsingle-part AUC (1 = perfect, 0.5 = coin flip):');
keys.forEach((k, i) => { const w = keys.map((_, j) => (j === i ? 1 : 0)); console.log(`  ${k.padEnd(12)} ${auc(w).toFixed(3)}`); });
console.log(`  old score    ${(() => { const pos = rows.filter((r) => r.y).map((r) => -r.old), neg = rows.filter((r) => !r.y).map((r) => -r.old); let s = 0; for (const p of pos) for (const n of neg) s += p < n ? 1 : p === n ? 0.5 : 0; return (s / (pos.length * neg.length)).toFixed(3); })()}`);
// coordinate search on weights
let w = keys.map(() => 1 / keys.length);
let bestA = auc(w);
for (let round = 0; round < 6; round++) {
  for (let i = 0; i < keys.length; i++) for (const v of [0, 0.25, 0.5, 1, 1.5, 2, 3]) {
    const t = [...w]; t[i] = v; const sum = t.reduce((a, b) => a + b, 0) || 1; const tn = t.map((x) => x / sum);
    const A = auc(tn); if (A > bestA + 1e-9) { bestA = A; w = tn; }
  }
}
// the same search with the sequence distance locked out (what the app can afford today)
{
  let w2 = keys.map((k) => (k === 'seq' ? 0 : 1 / (keys.length - 1)));
  let a2 = auc(w2);
  for (let round = 0; round < 6; round++) for (let i = 0; i < keys.length; i++) {
    if (keys[i] === 'seq') continue;
    for (const v of [0, 0.25, 0.5, 1, 1.5, 2, 3]) { const t = [...w2]; t[i] = v; const sum = t.reduce((a, b) => a + b, 0) || 1; const tn = t.map((x) => x / sum); const A = auc(tn); if (A > a2 + 1e-9) { a2 = A; w2 = tn; } }
  }
  const c2 = bestCut(w2);
  console.log(`\nwithout the sequence distance: AUC ${a2.toFixed(3)} · accuracy ${(c2.acc * 100).toFixed(0)} % (false-alike ${c2.fa}, missed ${c2.miss}) · weights ${keys.map((k, i) => `${k}=${w2[i].toFixed(2)}`).join(' ')} · scale ${(0.2 / c2.cut).toFixed(2)}`);
}
console.log('\nfitted weights:'); keys.forEach((k, i) => console.log(`  ${k.padEnd(12)} ${w[i].toFixed(3)}`));
const cut = bestCut(w);
console.log(`AUC ${bestA.toFixed(3)} · best cut at distance ${cut.cut.toFixed(3)} → accuracy ${(cut.acc * 100).toFixed(0)} % (false-alike ${cut.fa}, missed ${cut.miss})`);
console.log(`→ similarity = 1 − distance × scale; with scale so that the cut lands at 0.8: scale = ${(0.2 / cut.cut).toFixed(2)}`);
console.log('\npairs by fitted distance (y = owner says alike):');
for (const r of rows.map((r) => ({ ...r, d: dist(r, w) })).sort((a, b) => a.d - b.d)) console.log(`  ${r.d.toFixed(3)}  ${r.y ? 'ALIKE ' : '      '} ${r.a.slice(0, 26).padEnd(26)} | ${r.b.slice(0, 26)}`);
