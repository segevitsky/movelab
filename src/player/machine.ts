/** Pure player state machine. Time is passed in; no timers here (testable). */
import type { Step } from './timeline';

export type PlayerState = {
  steps: Step[];
  index: number;
  /** ms left in the current step */
  remainingMs: number;
  playing: boolean;
  /** total ms elapsed in work/rest (for stats) */
  elapsedMs: number;
  finished: boolean;
};

export type PlayerEvent = { type: 'step'; index: number } | { type: 'countdown'; seconds: number } | { type: 'go' } | { type: 'finished' };

export function createPlayer(steps: Step[]): PlayerState {
  return { steps, index: 0, remainingMs: (steps[0]?.seconds ?? 0) * 1000, playing: false, elapsedMs: 0, finished: steps.length === 0 || steps[0]?.kind === 'done' };
}

function enter(state: PlayerState, index: number, events: PlayerEvent[]): PlayerState {
  const i = Math.max(0, Math.min(state.steps.length - 1, index));
  const step = state.steps[i];
  const finished = step.kind === 'done';
  events.push({ type: 'step', index: i });
  if (finished) events.push({ type: 'finished' });
  else if (step.kind === 'work') events.push({ type: 'go' });
  return { ...state, index: i, remainingMs: step.seconds * 1000, finished, playing: finished ? false : state.playing };
}

/** Advance by dt ms. Returns the new state and the events that happened. */
export function tick(state: PlayerState, dtMs: number): { state: PlayerState; events: PlayerEvent[] } {
  const events: PlayerEvent[] = [];
  if (!state.playing || state.finished) return { state, events };
  let s = { ...state, elapsedMs: state.elapsedMs + dtMs };
  let left = s.remainingMs - dtMs;
  // countdown beeps at 3, 2, 1 (crossing whole seconds)
  const before = Math.ceil(s.remainingMs / 1000);
  const after = Math.ceil(Math.max(0, left) / 1000);
  if (after < before && after >= 1 && after <= 3) events.push({ type: 'countdown', seconds: after });
  if (left <= 0) {
    const carry = -left;
    s = enter(s, s.index + 1, events);
    if (!s.finished && carry > 0 && carry < s.remainingMs) s.remainingMs -= carry;
    return { state: s, events };
  }
  return { state: { ...s, remainingMs: left }, events };
}

export const play = (s: PlayerState): PlayerState => (s.finished ? s : { ...s, playing: true });
export const pause = (s: PlayerState): PlayerState => ({ ...s, playing: false });
export function skip(s: PlayerState): { state: PlayerState; events: PlayerEvent[] } {
  const events: PlayerEvent[] = [];
  return { state: enter(s, s.index + 1, events), events };
}
export function back(s: PlayerState): { state: PlayerState; events: PlayerEvent[] } {
  const events: PlayerEvent[] = [];
  // within the first 2 s of a step, go to the previous one; otherwise restart this step
  const target = s.remainingMs < s.steps[s.index].seconds * 1000 - 2000 ? s.index : s.index - 1;
  return { state: enter(s, Math.max(0, target), events), events };
}
export const plus = (s: PlayerState, seconds = 15): PlayerState => (s.finished ? s : { ...s, remainingMs: s.remainingMs + seconds * 1000 });

/** Index of the current work step among all work steps (for "4 / 18"). */
export function workProgress(s: PlayerState): { done: number; total: number } {
  const work = s.steps.map((st, i) => ({ st, i })).filter((x) => x.st.kind === 'work');
  const done = work.filter((x) => x.i < s.index).length + (s.steps[s.index]?.kind === 'work' ? 0 : 0);
  return { done, total: work.length };
}

/** Jump to the first step of the next section (block); finishes if there is none. */
export function skipBlock(s: PlayerState): { state: PlayerState; events: PlayerEvent[] } {
  const events: PlayerEvent[] = [];
  const cur = s.steps[s.index];
  const curBlock = cur.kind === 'done' ? null : cur.blockId;
  let target = s.steps.length - 1;
  for (let i = s.index + 1; i < s.steps.length; i++) { const st = s.steps[i]; if (st.kind === 'done' || st.blockId !== curBlock) { target = i; break; } }
  return { state: enter(s, target, events), events };
}
