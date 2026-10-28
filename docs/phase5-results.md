# Phase 5 — results (frameworks + generator)

Status (2026-10-28): **built; property tests green; owner check on device pending.**

## What was built
- `src/generator` (pure TS):
  - `generate(ctx)` — Architecture §6: per block / slot, candidates = library ∩ slot tags ∩ available
    equipment (archived + removed excluded); active goal stage takes the skill slot; score = pairing
    (co-occurrence from reels) + flow (end pose → start pose distance) − recency (last 3 workouts)
    − muscle clash within the round + focus match (+ energy nudges); softmax sample with
    T = 0.2 … 1.5 from `surprise`; **deterministic** (mulberry32 seed). Rounds repeat the same picks.
  - Hard rule: an exercise used in the last 3 workouts is never picked while an unused alternative exists.
  - `fitTime()` — drop optional slots when over budget, then scale dosages 0.5×…1.5× (time rounded to
    5 s, reps ≥ 3) to land within ±10 % of `timeAvailableMin`. `totalSeconds()` = work + 5 s transitions
    + framework rests.
  - `swap()` — re-sample one slot, everything else locked; remove = exclude + regenerate with locks.
  - `explain()` — rule-based one-liner (slots today · goal · what was avoided and when · missing cards · ≈ min).
  - `buildPairings()` — pairing graph from `source_exercise` (weight = co-occurrence, directed = order).
- `src/db/workoutRepo.ts` — loads the generator context from SQLite (library, pairings rebuilt, goals,
  14-day history), saves workouts (they count as history immediately), framework CRUD.
- `app/(tabs)/today.tsx` — framework chips, time (20/30/45/60), energy, focus, surprise → workout per
  block with looping thumbnails, dosage, swap / lock / remove, "why" line, total, save.
- `app/frameworks` — list (presets marked, duplicate, delete custom), editor: blocks (name, sequence /
  rounds ×N, rests) → slots (tags, dosage, skill / optional), reorder blocks.

## Acceptance
| Criterion | Result |
|---|---|
| Property tests: never repeats an exercise used in the last 3 workouts when alternatives exist; respects slot tags / equipment; hits target time ±10 % | **PASS** — 200 random libraries × seeds for repeats/tags/equipment; 100 trials for time (checked whenever the budget is reachable with 0.5–1.5× scaling); `npm test` → 48 tests |
| Same seed → same workout | **PASS** (asserted in the property test; `swap` changes only the requested slot) |

## Notes
- No LLM: `/explain` from the architecture is replaced by the rule-based `explain()` (owner: local only).
- With a small library most slots show "no card for … yet" — that is the feature telling you what to capture.
- Player (timers, auto-advance) = Phase 6; saving a workout today only records it as history.
