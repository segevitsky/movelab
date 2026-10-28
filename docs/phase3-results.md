# Phase 3 — results (data + library)

Status (2026-10-28): **done** — verified on the iOS Simulator by inspecting the SQLite file directly, and on the owner's iPhone. Everything is local: SQLite on the phone
(`expo-sqlite` + drizzle-orm), no server.

## What was built
- `src/db/schema.ts` — Architecture §7 tables (`exercise`, `source`, `source_exercise`, `pairing`,
  `framework`, `goal`, `workout`, `session`) + the new `exercise.scene` (Arch §5a: mat quad, crop rect).
  JSON columns are typed; the figure is stored as base64 of the Phase 2 codec (15 fps, int16, ≈ 2 KB/s).
- Migrations: `drizzle-kit generate` → `src/db/migrations/0000_init.sql`, applied at app start with
  `useMigrations` (`app/_layout.tsx`), then `seedIfNeeded()` inserts what is missing (idempotent, never
  overwrites user edits).
- Seed: 5 preset frameworks (Segev 3×6, EMOM 20, Tabata, Flow, Skill only) and the 6 goals from
  `reference/seed-goals.md` (stages keep names + criteria; `exerciseId` is linked by the user later).
  No `seed/` directory existed in the repo; add `seed/*.json` later and extend `seedIfNeeded` if wanted.
- `src/figure/codec.ts` — FigureClip ⇄ bytes (+ base64, + 15 fps downsample), tested: ¼-px round-trip,
  < 2.6 KB/s.
- `src/db/repo.ts` — CRUD, `filterExercises()` (pure, tested), `exerciseFromProcessed()` (pipeline
  segment → row with figure/loop/poses), `linkSource()` (reel → exercises relation for the pairing graph).
- Screens (expo-router tabs: Library · Today · Goals · Dev):
  - Library: 2-column grid of looping `FigureCard`s, search + pattern / slot / equipment chips, "+ Add".
  - Exercise detail: `FigurePlayer` (0.5×/1×, mirror, angle HUD), editable name/notes, pattern/slots/
    equipment/intensity/dosage chips (saved on tap), source link, archive, delete.
  - New exercise: name + optional link + tags (figure comes from a captured video in Phase 4).
  - Goals: read-only list of the seeded goals and stages (marking = Phase 7). Today: placeholder.
  - Dev: "Import the 3 lab reels" → 5 exercises with figures (also via deep link `movelab:///dev?import=lab`).
- State: zustand for the library filters; data via drizzle `useLiveQuery` (SQLite change listener).

## Acceptance
| Criterion | Result |
|---|---|
| CRUD works offline; app restart keeps data | **PASS** — simulator: first launch ran the migration (`__drizzle_migrations` = 1) and seeded 5 frameworks + 6 goals; the lab import created 5 exercises with 15 fps figures (9–82 KB base64 each), 3 sources, 5 source links; after terminate + relaunch the same rows were there and the import did not re-run. Everything is on-device SQLite (`Documents/SQLite/movelab.db`, WAL); no network. Update/archive/delete go through `updateExercise` / `deleteExercise` from the detail screen. |
| Filters by pattern / slot / equipment | **PASS** — `filterExercises()` unit-tested (pattern, slot, equipment incl. "none", text, archived); the Library screen drives it with chips + search, and accepts deep links (`movelab:///library?pattern=mobility`). |

## Notes
- Build gotchas: a custom `babel.config.js` must resolve `babel-preset-expo` from `node_modules/expo`
  (nested install); Metro needs `sourceExts` + `sql` for the inline-import plugin; restart Metro with
  `--clear` after changing either.
- Cards record their Skia pictures at mount; with ~60 cards use `FlatList` windowing (already on) and
  consider recording lazily — measure first.
