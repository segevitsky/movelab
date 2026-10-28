# Phase 6 — results (player)

Status (2026-10-28 evening): **GO** — first real run on the owner's phone: "this is sick, the player works really cool". The 5-workout count accrues in daily use.

## What was built
- `src/player/timeline.ts` (pure, tested): saved workout + framework → steps. Blocks in order, rounds
  expanded; `ready` (10 s before a block, 5 s between exercises when the block has no rest), `rest`
  (framework rests between exercises / rounds), `work` (time dosage, or reps × measured rep seconds
  from the card, default 3 s), final `done`.
- `src/player/machine.ts` (pure, tested): `tick(dt)` with carry-over, `play / pause / skip / back / +15 s`;
  events `countdown 3-2-1`, `go`, `step`, `finished`; `back` restarts the step unless within its first 2 s.
- `app/player/[workoutId].tsx`: full-screen figure (loops the card), block + round counter, progress
  bar, big countdown, "Next: …" during rest/ready, "then: …" during work, controls (back / play-pause /
  skip / +15 s), haptics on every transition, beeps (tick 3-2-1, go, done — generated WAVs in
  `assets/sounds`, play in silent mode), keep-awake, close with confirmation; end screen → easy / just
  right / hard → `session` row (`startSession` on open, `endSession` on feedback).
- Today: "▶ Start workout" (saves + opens the player), "Save for later", recent workouts list with play.

## Acceptance
| Criterion | Result |
|---|---|
| Owner completes 5 real workouts without touching the phone except start/end | **first run done on device, hands-free flow confirmed**; count continues in daily use (sessions are recorded) |

## Notes
- Reps-based steps count down an *estimate*; tapping skip ends them early. Adaptive dosage from
  feedback (Phase 7) will use the session rows.
- Native modules added: expo-keep-awake, expo-haptics, expo-audio (rebuild required).
