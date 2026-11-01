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
