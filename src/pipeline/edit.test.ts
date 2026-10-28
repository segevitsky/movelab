import { describe, expect, it } from 'vitest';
import { frameAt, mergeRanges, processRange, splitRange, trimRange } from './edit';
import { segment } from './segment';
import { estimateFps } from './resample';
import { loadReel } from './__fixtures__/load';
import { suggestTags, posture } from './tagger';
import { processCapture } from './index';

describe('review edits', () => {
  const frames = loadReel('reel1_mobility_mp33');
  const fps = estimateFps(frames);
  const segs = segment(frames);

  it('merge two neighbours → one range covering both; reprocess works', () => {
    const m = mergeRanges(segs[0], segs[1]);
    expect(m.start).toBe(segs[0].start);
    expect(m.end).toBe(segs[1].end);
    const p = processRange(frames, m, fps);
    expect(p.xy.length).toBe(m.end - m.start + 1);
    expect(p.features.activeJoints).toHaveLength(2);
  });
  it('split at a time, trim, and refuse tiny pieces', () => {
    const r = { start: segs[2].start, end: segs[2].end };
    const at = frameAt(frames, 20.0, r);
    const halves = splitRange(r, at)!;
    expect(halves).not.toBeNull();
    expect(halves[0].end + 1).toBe(halves[1].start);
    expect(frames[halves[1].start].t).toBeCloseTo(20.0, 1);
    expect(splitRange(r, r.start + 3)).toBeNull();
    const tr = trimRange(r, frameAt(frames, 14, r), frameAt(frames, 16, r))!;
    expect(frames[tr.start].t).toBeCloseTo(14, 1);
    expect(frames[tr.end].t).toBeCloseTo(16, 1);
    expect(trimRange(r, r.start, r.start + 2)).toBeNull();
  });
});

describe('local tagger', () => {
  it('burpee reel → cardio/push family, reps; staff → standing, time', () => {
    const bur = processCapture({ frames: loadReel('reel3_burpee_mp33') });
    const main = bur.reduce((a, b) => (b.xy.length > a.xy.length ? b : a));
    const s = suggestTags({ xy: main.xyFull, features: main.features, periodSeconds: main.period?.periodic ? main.period.period : null, caption: null });
    expect(s.dosage.type).toBe('reps');
    expect(['push', 'core', 'cardio', 'mobility']).toContain(s.pattern);
    const staff = processCapture({ frames: loadReel('reel2_staff_mp33') })[0];
    expect(posture(staff.xyFull)).toBe('standing');
    const t = suggestTags({ xy: staff.xyFull, features: staff.features, periodSeconds: null, caption: 'Shaolin staff flow — warm up' });
    expect(t.pattern).toBe('skill');
    expect(t.equipment).toContain('staff');
    expect(t.slots).toContain('warmup');
    expect(t.dosage.type).toBe('time');
  });
  it('caption keywords win over posture', () => {
    const seg = processCapture({ frames: loadReel('reel1_mobility_mp33') })[0];
    const s = suggestTags({ xy: seg.xyFull, features: seg.features, periodSeconds: null, caption: '3 squat variations with a kettlebell' });
    expect(s.pattern).toBe('squat');
    expect(s.slots).toContain('legs');
    expect(s.equipment).toContain('kettlebell');
  });
});
