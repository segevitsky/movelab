import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { processCapture } from '..';
import { loadReel } from '../__fixtures__/load';
import { median, percentile } from '../math';
import { endJerk, pointInPolygon, trackStaff, type StaffLine } from './staff';

const LINES: StaffLine[] = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../reference/sample-data/reel2_staff_lines.json'), 'utf8'));

describe('staff tracker (port of staffproc3.py)', () => {
  const frames = loadReel('reel2_staff_mp33');
  const seg = processCapture({ frames })[0];
  const times = seg.xy.map((_, i) => frames[seg.segment.start + i].t);
  const torso = median(seg.xy.map((P) => Math.hypot((P[11][0] + P[12][0]) / 2 - (P[23][0] + P[24][0]) / 2, (P[11][1] + P[12][1]) / 2 - (P[23][1] + P[24][1]) / 2)).filter(Number.isFinite));
  const track = trackStaff(LINES, seg.xy, times, seg.fps, torso, { pinOffset: seg.pinOffset });

  it('builds a rigid rod of constant length on every frame of the staff reel', () => {
    expect(track.L).toBeGreaterThan(torso * 1.5);
    const lens = track.a.map((a, i) => (a && track.b[i] ? Math.hypot(track.b[i]![0] - a[0], track.b[i]![1] - a[1]) : NaN)).filter(Number.isFinite);
    expect(lens.length).toBe(track.a.length);
    expect(Math.max(...lens) - Math.min(...lens)).toBeLessThan(1e-6);
    expect(track.ok.filter(Boolean).length).toBeGreaterThan(track.ok.length * 0.6);
  });

  it('moves smoothly: spikes of the raw detections are gone, the median is real motion (≈ 2× wrist speed)', () => {
    const j = endJerk(track);
    const ok = LINES.filter((l) => l.ok && l.p1 && l.p2);
    const raw: number[] = [];
    for (let i = 1; i < ok.length; i++) raw.push(Math.max(Math.hypot(ok[i].p1![0] - ok[i - 1].p1![0], ok[i].p1![1] - ok[i - 1].p1![1]), Math.hypot(ok[i].p2![0] - ok[i - 1].p2![0], ok[i].p2![1] - ok[i - 1].p2![1])));
    const wrist: number[] = [];
    for (let i = 1; i < seg.xy.length; i++) { const a = seg.xy[i - 1][15], b = seg.xy[i][15]; if (Number.isFinite(a[0]) && Number.isFinite(b[0])) wrist.push(Math.hypot(b[0] - a[0], b[1] - a[1])); }
    expect(percentile(j, 99)).toBeLessThan(percentile(raw, 99) * 0.25); // prototype: 449 → 76
    expect(median(j)).toBeLessThan(median(raw));
    expect(median(j)).toBeLessThan(median(wrist) * 2.5);
  });

  it('marks the rod behind the body only in short, stable stretches', () => {
    let flips = 0;
    for (let i = 1; i < track.behind.length; i++) if (track.behind[i] !== track.behind[i - 1]) flips++;
    expect(flips).toBeLessThan(12);
  });

  it('returns an empty track without detections', () => {
    const none = trackStaff([], seg.xy, times, seg.fps, torso);
    expect(none.L).toBe(0);
    expect(none.a.every((p) => p === null)).toBe(true);
  });

  it('point in polygon', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(sq, [5, 5])).toBe(true);
    expect(pointInPolygon(sq, [15, 5])).toBe(false);
  });
});
