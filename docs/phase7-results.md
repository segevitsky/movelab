# Phase 7 — results (goals + adaptation)

Status (2026-10-28): **built** (owner's redirection: "if we have goals then we need to ask for drills").

## What was built
- Goals tab rebuilt around drills: each goal is a ladder of stages; the **current stage shows its linked
  drill** (still thumbnail) or a "Needs a drill" state with *Choose from library* (picker, slot-matching
  cards first) and *Capture one*. "Stage passed → next" advances the ladder; the last stage completes
  the goal. All stages are listable, editable (name, criterion, make current, remove), stages can be
  added; new goals are created with their own slot and stages. Active toggle per goal.
- Generator: **active goals rotate through the skill slot**, least-recently-used first (up to 3 per
  workout as the framework has skill slots). The "why" line names them.
- Adaptation: session feedback → per-exercise dosage factor (`dosageFactors()`: hard −10 %, easy +10 %,
  compounding over the last 30 days, clamped 0.7–1.3) applied when generating.
- `src/ui/ExercisePicker.tsx` shared picker (also used by Today's "Choose from library…").

## Acceptance
| Criterion | Result |
|---|---|
| Passing a stage changes the next generated workout | **PASS** (unit test: stage 1 vs stage 2 drill lands in the skill slot; rotation test; feedback factor test) — on device: mark a stage passed, then Today ▸ Today's workout shows the next stage's drill |
