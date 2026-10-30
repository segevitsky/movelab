/** `npm run eval [--json out.json] [--label name]` — one table per fixture. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalFixture, type SegmentEval } from './run';
import { fmt } from './metrics';
import type { RawFrame } from '../types';

const ROOT = join(__dirname, '..', '..', '..');
const FIXTURES: { name: string; load: () => RawFrame[] }[] = [
  { name: 'reel1_mobility', load: () => JSON.parse(readFileSync(join(ROOT, 'reference/sample-data/reel1_mobility_mp33.json'), 'utf8')) },
  { name: 'reel2_staff', load: () => JSON.parse(readFileSync(join(ROOT, 'reference/sample-data/reel2_staff_mp33.json'), 'utf8')) },
  { name: 'reel3_burpee', load: () => JSON.parse(readFileSync(join(ROOT, 'reference/sample-data/reel3_burpee_mp33.json'), 'utf8')) },
  { name: 'reel4_phone_plank', load: () => JSON.parse(readFileSync(join(ROOT, 'reference/sample-data/phone/reel4_plank_romove_mp33_phone.json'), 'utf8')).frames },
];

function table(name: string, rows: SegmentEval[]) {
  const head = ['segment', 'frames', 'contact', 'float', 'skate', 'boneJump%', 'flagged%', 'depthFlips/s'];
  const lines = rows.map((r) => [`${r.label} ${r.t0.toFixed(1)}–${r.t1.toFixed(1)}s`, String(r.metrics.frames), String(r.metrics.contactFrames), fmt(r.metrics.float), fmt(r.metrics.skate), fmt(r.metrics.boneJump, 1), fmt(r.metrics.flagged, 1), fmt(r.metrics.depthFlips, 2)]);
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const pad = (s: string, i: number) => s.padEnd(widths[i]);
  console.log(`\n## ${name}`);
  console.log(head.map(pad).join(' | '));
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
  for (const l of lines) console.log(l.map(pad).join(' | '));
}

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'current';
const all: Record<string, SegmentEval[]> = {};
for (const f of FIXTURES) {
  const rows = evalFixture(f.load());
  all[f.name] = rows;
  table(f.name, rows);
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ label, at: new Date().toISOString(), fixtures: all }, null, 1)); console.log(`\nsaved ${jsonOut}`); }
