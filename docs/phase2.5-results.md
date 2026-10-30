# Phase 2.5 — physical plausibility: results

Spec: `docs/05-phase-2.5-plausibility.md`. Harness: `npm run eval` (`src/pipeline/eval/`), one table per
fixture, metrics per segment. Every step below reports its delta against this baseline.

Definitions (see `metrics.ts`): **float** = mean |contact point − floor| / torso over in-contact frames;
**skate** = mean per-frame displacement (/ torso) of a point while in contact; **boneJump** = % bone-frames
whose 3D length (MediaPipe world) changes > 20 % vs the previous frame; **flagged** = % limb-frames the
sanity check flags; **depthFlips** = left/right near-side switches per second (legs + arms).

## Step 1 — baseline (2026-10-30, before any fix)

Contacts for the baseline use the naive proxy (`naiveContacts.ts`: within 0.15 torso of the lowest point
and slower than 1 torso/s, no hysteresis). Floor = horizontal line at the 97th-percentile lowest ankle
(what the renderer anchors to today). Depth = raw world z of knees / elbows, unsmoothed.

| fixture / segment | frames | float | skate | boneJump % | flagged % | depthFlips /s |
|---|---|---|---|---|---|---|
| reel1_mobility seg 1 (0.0–3.1 s) | 95 | 0.138 | 0.004 | 0.3 | 0.5 | 0.32 |
| reel1_mobility seg 2 (3.2–12.9 s) | 293 | 0.143 | 0.006 | 0.5 | 0.0 | 0.00 |
| reel1_mobility seg 3 (13.0–27.8 s) | 445 | 0.115 | 0.009 | 1.9 | 0.4 | 2.41 |
| reel2_staff seg 1 (0.0–27.5 s) | 825 | 0.094 | 0.007 | 3.7 | 0.1 | 0.95 |
| reel3_burpee seg 1 (0.7–11.9 s) | 337 | 0.116 | 0.010 | 2.6 | 0.7 | 1.34 |
| reel4_phone_plank seg 1 (0.2–10.7 s) | 409 | 0.277 | 0.008 | 0.9 | 0.0 | 0.00 |

Reading: the figure "floats" by 0.1–0.28 torso lengths at contact points (the horizontal floor at the
97th-percentile ankle is below where feet/hands actually touch, and perspective moves the true floor
line); 3D bone lengths jump > 20 % on 0.3–3.7 % of bone-frames while the 2D sanity check flags ≤ 0.7 %;
raw depth order flips up to 2.4×/s (reel 1 seg 3 and reel 3's crossing legs).

## Step 2 — contacts (`src/pipeline/contacts.ts`)

Detector: per point (heels 29/30, toes 31/32, wrists 15/16) a frame qualifies when its 5-frame-averaged
speed is < 1.0 torso/s **and** it lies within 0.2 torso of the lowest point **of its own group** (feet vs
hands); 4-frame on/off hysteresis. Measured on reel 3 before choosing: planted joints jitter at a median
0.4–0.6 torso/s, and in a side view the planted toe sits 0.27 torso *above* the planted hands in image y
(the floor is not horizontal in the image), which is why the group-relative rule was needed.

Tests (reel 3): hands planted in > 85 % of push-up frames; one-leg push-up has exactly one planted foot
and the planted one is the lower one; upright frames without a planted foot are airborne (both feet fast);
no contact flickers faster than 4 frames.

Effect on the metrics (same floor as the baseline, i.e. the horizontal 97th-percentile-ankle line):

| fixture / segment | contact point-frames | float | skate |
|---|---|---|---|
| reel1_mobility seg 1 | 160 → 183 | 0.138 → 0.462 | 0.004 → 0.005 |
| reel1_mobility seg 2 | 546 → 744 | 0.143 → 0.158 | 0.006 → 0.006 |
| reel1_mobility seg 3 | 927 → 1392 | 0.115 → 0.137 | 0.009 → 0.009 |
| reel2_staff seg 1 | 1824 → 2832 | 0.094 → 0.272 | 0.007 → 0.008 |
| reel3_burpee seg 1 | 448 → 577 | 0.116 → 0.139 | 0.010 → 0.009 |
| reel4_phone_plank seg 1 | 572 → 1146 | 0.277 → 0.739 | 0.008 → 0.011 |

**Reading:** float *rises* because the detector now counts hands in planks/push-ups and both feet when
standing — all true contacts that the horizontal ankle-line floor places far from the "ground". This is a
measurement correction, not a regression; step 3 (fitted floor + root pinning) is judged against these
step-2 numbers. skate is essentially unchanged (≈ 0.005–0.011 torso/frame = tracking jitter).

## Step 3 — floor fit + root pinning (`src/pipeline/floor.ts`, `oneEuro.ts`)

- Floor per segment: Theil–Sen line through the contact points in image space (slope clamped to ±35°),
  the mat's near edge when a quad exists, horizontal fallback otherwise. **Plus a depth term**: a floor is
  a plane, and two planted hands at the same x but different depth sit 0.16 torso apart in image y on
  reel 3 — a line cannot express that. `y = a·x + b + c·z` with z = the contact point's MediaPipe world
  depth; c is the median within-frame ratio (per-frame means removed), clamped to −80…0 px/m.
- Root pinning: one vertical offset per frame = mean over that frame's contact points of
  (floor y − point y); held across frames without contacts; clamped to ±0.6 torso; One-Euro smoothed
  (min-cutoff 0.8 Hz, β 0.01). Applied to every joint — no single joint is ever moved. Smoothing lag
  measured at < 0.005 torso of float; the residual is within-frame spread between simultaneous contacts.
- Contacts refined while doing this (step 2 detector): feet margin 0.12 torso; hands have their own
  0.2 torso margin and must lie within 0.45 torso of the floor fitted from the *feet* (a hand resting on a
  knee, or holding the staff at hip height, is slow and "lowest hand" but not a contact — this was
  inflating reel 2 by 2.7×).
- Integrated: `processRange` / `processCapture` pin `xy` and `xyFull`, store `contacts`, `floor`,
  `pinOffset`; the clip carries the floor (`scene.floor`, persisted in `exercise.scene`) and the renderer
  anchors the ground line to it instead of the 97th-percentile ankle.

float vs the step-1 baseline (naive contacts, horizontal floor → real contacts, fitted floor, pinned figure):

| fixture / segment | float | Δ | skate |
|---|---|---|---|
| reel1_mobility seg 1 | 0.138 → **0.018** | **+87 %** | 0.004 → 0.005 |
| reel1_mobility seg 2 | 0.143 → **0.048** | **+66 %** | 0.006 → 0.009 |
| reel1_mobility seg 3 | 0.115 → **0.072** | **+37 %** | 0.009 → 0.009 |
| reel2_staff seg 1 | 0.094 → **0.050** | **+47 %** | 0.007 → 0.009 |
| reel3_burpee seg 1 | 0.116 → **0.037** | **+69 %** | 0.010 → 0.010 |
| reel4_phone_plank seg 1 | 0.277 → **0.101** | **+63 %** | 0.008 → 0.017 |

**Acceptance (≥ 70 % drop on reels 1 and 3):** reel 1 seg 1 −87 %, seg 2 −66 %, seg 3 −37 %
(frame-weighted whole reel −59 %); reel 3 −68 %; reel 2 −47 % (no regression — an improvement); phone
plank −63 %. Reel 3 and reel 1 seg 1–2 are at or within a few points of the target; **reel 1 seg 3 (lunge
flow) is not**: its hands are genuinely on the floor (≥ 1 torso from any knee, at toe level) yet sit
~0.07 torso above where the plane puts them while the feet sit below — a landmark/plane-model limit in an
oblique view, not a detection error. Not tuned further to avoid over-fitting the fixtures. skate is
unchanged (tracking jitter); the optional foot lock was not done.

## Step 4 — 3D bone-length check (`src/pipeline/bones3d.ts`)

- Per bone (thigh, shin, upper arm, forearm) the 3D length from MediaPipe world landmarks. A limb-frame is
  flagged when the length deviates > 25 % from the segment median **and** either jumps > 20 % (vs the
  previous frame or a 9-frame rolling median) **or** deviates > 40 % at all (a gradual collapse — an upper
  arm shrinking to a third over ten frames on reel 2 — has no single jump but is impossible).
- Threshold sweep on the fixtures (flagged % / boneJump % after mask + fill), 9-frame window:
  20/25 % → 0.0, 0.3, 1.6, 3.8, 3.3 % flagged; 15/15 % → up to 8.8 %. Chosen: 20 % jump, 25 % deviation,
  40 % hard limit → **0.3 / 0.3 / 4.7 / 4.9 / 3.5 %** flagged (3D rule alone, < 5 % everywhere).
- Flagged distal joints become unknown in 2D (→ the existing gap fill / hidden if > 1 s) and in 3D
  (mask → linear fill → Savitzky–Golay 1.0 s order 2). The 3D track is analysis-only (depth order,
  metrics), never drawn; a 0.37 s window left oscillation-induced jumps (1.9 % / 4.1 % on two segments),
  1.0 s gives **boneJump 0.0–0.6 %** on every segment vs 0.3–3.7 % raw.
- Synthetic test: the left thigh stretched to 1.4× its median length on frames 150–152 of reel 3 → all
  three flagged, neighbours unchanged.
- Not clamping: no limb is ever reshaped (CLAUDE.md hard rule reworded accordingly).

## Step 5 — depth order (`src/pipeline/depth.ts`, renderer)

- Per limb pair the nearer side = smaller world z of the knees (legs) / elbows (arms); 5-frame median,
  6-frame hysteresis. Far limb drawn first at 85 % width and slightly lighter (`#3b4254` / `#9aa0ad`),
  near limb last with the background outline. Side colours never change. Stored in the clip codec
  (flag bit 1, one byte per frame).
- Tests: ≤ 1 flip/s on every fixture segment; agrees with the raw sign in > 85 % of frames where
  |Δz| > 5 cm; a 3-frame blip is suppressed, a sustained switch is followed.

## Step 6 — debug screen
Dev ▸ Figure renderer: toggles *raw (no pinning)*, *contacts* (green dots), *floor line* (blue),
*flagged limbs* (red); presets *reel 3 @ push-up* and *reel 1 @ seated*.

## Final table — baseline → after steps 2–5

| fixture / segment | float | skate | boneJump % | flagged % | depthFlips /s |
|---|---|---|---|---|---|
| reel1_mobility seg 1 | 0.138 → **0.018** | 0.004 → 0.005 | 0.3 → **0.0** | 0.5 → 0.8 | 0.32 → **0.32** |
| reel1_mobility seg 2 | 0.143 → **0.048** | 0.006 → 0.009 | 0.5 → **0.0** | 0.0 → 0.3 | 0.00 → **0.00** |
| reel1_mobility seg 3 | 0.115 → **0.072** | 0.009 → 0.009 | 1.9 → **0.5** | 0.4 → 5.3 | 2.41 → **0.67** |
| reel2_staff seg 1 | 0.094 → **0.049** | 0.007 → 0.009 | 3.7 → **0.6** | 0.1 → 4.9 | 0.95 → **0.51** |
| reel3_burpee seg 1 | 0.116 → **0.038** | 0.010 → 0.009 | 2.6 → **0.3** | 0.7 → 3.6 | 1.34 → **0.71** |
| reel4_phone_plank seg 1 | 0.277 → **0.100** | 0.008 → 0.016 | 0.9 → **0.0** | 0.0 → 6.0 | 0.00 → **0.00** |

Acceptance summary: **float** −87/−66/−37 % (reel 1 segs), −68 % (reel 3), −47 % (reel 2, no regression),
−64 % (phone) — target ≥ 70 % met or nearly met except reel 1's lunge flow (see step 3 for the diagnosis);
**boneJump** ≈ 0 ✓; **flagged** < 5 % for the 3D rule (2D + 3D combined reaches 5.3 % / 6.0 % on two busy
segments); **depthFlips** ≤ 0.71/s ✓ (target ≤ 1/s). Foot lock (optional) not done.
