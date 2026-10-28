# CLAUDE.md — MoveLab

Personal-first iPhone app that turns fitness reels into an exercise library and generated workouts.
Read `docs/01-product-spec.md`, `docs/02-architecture.md`, `docs/03-implementation-plan.md`,
`docs/04-pose-lab-findings.md` before working.

## How to work here
- Work on **one phase at a time** (see the plan). Stop at the phase's acceptance criteria and report.
- If something in the docs is wrong or blocked, say so and propose a change to the doc — don't silently diverge.
- Put new ideas in the plan's "Parking lot", not in code.

## Conventions
- TypeScript strict. Expo dev client, expo-router, Skia, expo-sqlite + drizzle, zustand.
- `src/pipeline` and `src/generator` are **pure TS**: no React, no native imports, fully unit-tested (vitest).
- Native code lives only in `modules/*` (Swift, Expo Modules API) and returns plain JSON.
- Landmark order is **MediaPipe Pose 33** everywhere (0 nose … 11/12 shoulders, 13/14 elbows,
  15/16 wrists, 23/24 hips, 25/26 knees, 27/28 ankles, 29/30 heels, 31/32 toe tips).
  Left = odd, right = even. The COCO-17 subset mapping is in `reference/pose-pipeline/mp2coco.py`.
- Generator is deterministic given a seed.

## Hard rules
- Never download or scrape Instagram server-side. Never ask for, read or store Instagram credentials;
  a logged-in WebView is the user's own session, nothing more. No automation of Instagram.
- Recorded videos are deleted after processing. Store skeletons + metadata + source URL only.
- The backend receives text/metadata only — never video or images.
- The figure draws only what was detected: feet only from detected heel/toe; no bone-length
  "correction"; no near/far colouring from confidence (all tried, all looked worse).
- Never trust a model's own confidence alone — run the sanity checks in Architecture §4.2.
- LLM output that references exercises must be validated against library IDs.

## Reference
`reference/` holds the Python prototype (MediaPipe + YOLO experiments, cleaning, reps/loop, staff
tracking, renderer) and real sample data from 3 reels. It is the behavioural spec for the TS port;
do not ship Python.
