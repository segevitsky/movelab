/**
 * Phase 13 — which part of a recording is the reel actually playing. The capture screen logs the player's
 * events (play / ended / looped / seekback) with the seconds recorded so far; before the first `play` the
 * page shows a still poster frame (the pose model happily finds a person on it), after `ended` / `looped`
 * the reel starts over. Pure.
 */
export type PlayerEvent = { e: string; t: number; d: number; rec: number };

export function playbackWindow(timeline: PlayerEvent[]): { start: number; end: number } {
  const play = timeline.find((ev) => ev.e === 'play');
  // the first wrap at least 5 s in (earlier ones are re-buffers)
  const end = timeline.find((ev) => (ev.e === 'ended' || ev.e === 'looped') && ev.rec >= 5 && (!play || ev.rec > play.rec + 1));
  return { start: play ? play.rec : 0, end: end ? end.rec : Infinity };
}
