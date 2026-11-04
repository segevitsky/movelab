/**
 * Phase 13 — the owner's real captures as fixtures (raw MediaPipe frames + player timeline, never video).
 * Each case states what the owner expected; a failing expectation here is a capture bug to fix.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { segment } from './segment';
import { estimateFps, resample } from './resample';
import { playbackWindow } from './playback';
import type { RawFrame } from './types';
import { processCapture } from './index';
import { LM } from './types';

type Capture = { timeline?: { e: string; t: number; d: number; rec: number }[]; result: { frames: RawFrame[] } };
const load = (name: string): Capture => JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'owner', name), 'utf8'));
const at30 = (frames: RawFrame[]) => (Math.abs(estimateFps(frames) - 30) > 1 ? resample(frames, 30) : frames);

describe('owner capture 2026-11-01: reel DfGIOMWuPrs (6.8 s, two drills, poster frame before playback)', () => {
  const cap = load('capture-2026-11-01-DfGIOMWuPrs.json');

  it('the playback window comes from the player timeline (play → ended)', () => {
    const w = playbackWindow(cap.timeline ?? []);
    expect(w.start).toBeCloseTo(5.7, 1);
    expect(w.end).toBeCloseTo(12.7, 1);
  });

  it('the still poster frame before playback is not an exercise', () => {
    const w = playbackWindow(cap.timeline ?? []);
    const frames = at30(cap.result.frames).filter((f) => f.t >= w.start && f.t <= w.end);
    const segs = segment(frames);
    expect(segs[0].t0).toBeGreaterThan(5.5);
  });

  // The owner reports two drills in this reel; by pose statistics the transition (≈ 9.6 s, a 0.63 jump over calm
  // ≈ 0.1) is indistinguishable from his own fast moves at 8.8 s and 11.3 s and from the staff flow's spins
  // (soft-cut rule tried 2026-11-01 night: found this cut but split the staff flow). Needs visual scene cuts
  // from the native side (pipeline `cutTimes`) — plan Phase 13 step 2.
  it.todo('the two drills are split at the edited transition (≈ 9.6 s) via native scene cuts');
});

describe('owner capture 2026-11-02: reel DfC8LdUIjV4 (floor core drill — the legs disappear)', () => {
  const cap = load('capture-2026-11-02-DfC8LdUIjV4.json');
  const legs = [LM.leftKnee, LM.leftAnkle, LM.rightKnee, LM.rightAnkle];
  const unknownShare = (xy: number[][][]) => { let u = 0, n = 0; for (const f of xy) for (const j of legs) { n++; if (!Number.isFinite(f[j][0])) u++; } return u / n; };

  it('MediaPipe loses the legs on the floor: the flagged frames are wrong in the image too; short gaps are held, not drawn raw', () => {
    const seg = processCapture({ frames: cap.result.frames })[0];
    const flagged = seg.issues.filter((i) => i.kind === 'bone-length');
    expect(flagged.length).toBeGreaterThan(20); // ≈ 26 % of frames
    // the drawn track hid them (≈ 50 %); since the owner's 2026-11-04 call short gaps hold the last pose → few left
    expect(unknownShare(seg.xy as number[][][])).toBeLessThan(0.15);
    expect(unknownShare(seg.xyFull as number[][][])).toBeLessThan(0.05); // the analysis track bridges them
  });

  // What would fix it: a second model's legs where MediaPipe's are implausible (Apple Vision, stored in raw
  // captures from 2026-11-04 on as `resultVision`), merged per joint — plan Phase 13 step 3.
  it.todo('legs stay drawn in floor poses via the Vision second opinion');
});
