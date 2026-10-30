import { describe, expect, it } from 'vitest';
import { PRESET_FRAMEWORKS } from '../db/seed';
import { buildTimeline, totalTimelineSeconds, type TimelineItem } from './timeline';
import { back, backBlock, createPlayer, pause, play, plus, skip, skipBlock, tick, workProgress } from './machine';

const segev = PRESET_FRAMEWORKS.find((f) => f.id === 'preset-segev-3x6')!;
const items: TimelineItem[] = [];
for (const b of segev.blocks.blocks) {
  const rounds = b.kind === 'rounds' ? b.rounds ?? 1 : 1;
  for (let r = 1; r <= rounds; r++) b.slots.forEach((s, i) => { if (!s.optional) items.push({ blockId: b.id, slotId: s.id, round: r, exerciseId: `${b.id}-${i}`, dosage: s.dosage ?? { type: 'reps', value: 8 } }); });
}

describe('timeline', () => {
  const steps = buildTimeline(items, segev.blocks, { repSecondsOf: () => 2.5 });
  it('orders blocks → rounds → slots, inserts get-ready / rests, ends with done', () => {
    expect(steps[0].kind).toBe('ready');
    expect(steps[1].kind).toBe('work');
    expect(steps[steps.length - 1].kind).toBe('done');
    const work = steps.filter((s) => s.kind === 'work');
    expect(work).toHaveLength(items.length);
    // 3 rounds × 5 non-optional slots: between rounds there is a 120 s rest
    const rests = steps.filter((s) => s.kind === 'rest' && s.seconds === 120);
    expect(rests).toHaveLength(2);
    // reps → seconds from repSeconds
    const reps = work.find((w) => w.kind === 'work' && w.dosage.type === 'reps')!;
    expect(reps.seconds).toBe(Math.round(8 * 2.5));
    expect(totalTimelineSeconds(steps)).toBeGreaterThan(600);
  });
});

describe('player machine', () => {
  const steps = buildTimeline(items, segev.blocks);
  it('counts down, emits 3-2-1 and go, auto-advances with carry, finishes', () => {
    let s = play(createPlayer(steps));
    const seen: string[] = [];
    let guard = 0;
    while (!s.finished && guard++ < 100000) {
      const r = tick(s, 250);
      s = r.state;
      for (const e of r.events) seen.push(e.type === 'countdown' ? `c${e.seconds}` : e.type);
    }
    expect(s.finished).toBe(true);
    expect(seen.filter((x) => x === 'go')).toHaveLength(steps.filter((x) => x.kind === 'work').length);
    expect(seen).toContain('c3');
    expect(seen).toContain('c1');
    expect(seen[seen.length - 1]).toBe('finished');
    expect(Math.abs(s.elapsedMs / 1000 - totalTimelineSeconds(steps))).toBeLessThan(1);
  });
  it('pause stops time; skip/back/plus behave', () => {
    let s = createPlayer(steps);
    expect(tick(s, 1000).state.remainingMs).toBe(s.remainingMs); // not playing
    s = play(s);
    s = tick(s, 1000).state;
    expect(s.remainingMs).toBe(9000);
    s = pause(s);
    expect(tick(s, 5000).state.remainingMs).toBe(9000);
    s = play(s);
    s = skip(s).state;
    expect(s.index).toBe(1);
    expect(s.steps[1].kind).toBe('work');
    const r0 = s.remainingMs;
    s = plus(s, 15);
    expect(s.remainingMs).toBe(r0 + 15000);
    // back within the first 2 s → previous step
    s = back(s).state;
    expect(s.index).toBe(0);
    // deep into a step → restart it
    s = skip(s).state;
    s = tick(s, 5000).state;
    const idx = s.index;
    s = back(s).state;
    expect(s.index).toBe(idx);
    expect(s.remainingMs).toBe(s.steps[idx].seconds * 1000);
    expect(workProgress(s).total).toBe(items.length);
  });
});

describe('sections', () => {
  it('skipBlock jumps to the next section; overrides skip a block and change rounds; extra slots are included', () => {
    const steps = buildTimeline(items, segev.blocks);
    let s = play(createPlayer(steps));
    expect(steps[s.index].kind !== 'done' && (steps[s.index] as any).blockId).toBe('warmup');
    s = skipBlock(s).state;
    expect((s.steps[s.index] as any).blockId).toBe('rounds');
    s = skip(s).state; s = skip(s).state; // a few steps into the rounds block
    const roundsStart = s.steps.findIndex((st) => st.kind !== 'done' && st.blockId === 'rounds');
    s = backBlock(s).state;
    expect(s.index).toBe(roundsStart); // first: back to the start of this section
    s = backBlock(s).state;
    expect(s.index).toBe(0); // then: start of the previous section (warm-up)
    expect(backBlock(s).state.index).toBe(0); // and never below 0
    const skipped = buildTimeline(items, segev.blocks, { blockOverrides: { warmup: { skipped: true }, rounds: { rounds: 2 } } });
    expect(skipped.some((st) => st.kind !== 'done' && st.blockId === 'warmup')).toBe(false);
    expect(skipped.filter((st) => st.kind === 'work' && st.blockId === 'rounds').length).toBe(2 * items.filter((i) => i.blockId === 'rounds' && i.round === 1).length);
    const extra = buildTimeline([...items, { blockId: 'warmup', slotId: 'extra-1', round: 1, exerciseId: 'x', dosage: { type: 'time', value: 30 } }], segev.blocks);
    expect(extra.filter((st) => st.kind === 'work' && st.blockId === 'warmup').map((st: any) => st.exerciseId)).toContain('x');
    // 4 rounds from a 3-round framework: round 4 reuses round-1 picks
    const more = buildTimeline(items, segev.blocks, { blockOverrides: { rounds: { rounds: 4 } } });
    expect(more.filter((st) => st.kind === 'work' && st.blockId === 'rounds' && st.round === 4).length).toBe(items.filter((i) => i.blockId === 'rounds' && i.round === 1).length);
  });
});
