# Phase 2.5 — handoff summary (for review by another Claude / a reviewer)

_Written 2026-10-30. Spec: `docs/05-phase-2.5-plausibility.md`. Numbers: `docs/phase2.5-results.md`.
Everything is pure TypeScript under `src/pipeline` (vitest) except the renderer bits in `src/figure`._

## What was done, in the spec's order
1. **Eval harness** — `src/pipeline/eval/` (`npm run eval [--stage baseline|step2|step3|step4|step5] [--json f]`).
   Metrics per fixture segment: float, skate, boneJump, flagged, depthFlips. Baseline saved before any fix.
2. **Contacts** — `contacts.ts`: speed < 1 torso/s (5-frame mean) and within a margin of the lowest point of
   the point's own group (feet 0.12, hands 0.2 torso); hands additionally within 0.45 torso of the floor
   fitted from the feet; 4-frame on/off hysteresis. Tested on reel 3 (push-up hands, one-leg push-up, lunge).
3. **Floor + root pinning** — `floor.ts`, `oneEuro.ts`: Theil–Sen line through contact points (or the mat's
   near edge) **plus a depth term** `c·z` from MediaPipe world depth (a floor is a plane; two planted hands
   at different depths sit at different image y). One vertical offset per frame, held across gaps,
   clamped ±0.6 torso, One-Euro smoothed, applied to the whole figure. Foot lock / IK not done.
4. **3D bone-length check** — `bones3d.ts`: flag a limb-frame on a sudden jump (> 20 % vs previous frame or
   a 9-frame rolling median) AND > 25 % deviation from the segment median; flagged distal joints become
   unknown in 2D and 3D → gap fill → Savitzky–Golay. Rejection, never clamping (CLAUDE.md updated).
5. **Depth order** — `depth.ts` + renderer: nearer side per limb pair from world z of knees / elbows,
   5-frame median + 6-frame hysteresis; far limb drawn first at 85 % width and slightly lighter; colours
   stay fixed per side. Stored in the clip codec (flag bit 1).
6. **Debug screen** — Dev ▸ Figure renderer: raw vs corrected, contact dots, flagged limbs, floor line;
   presets "reel 3 @ push-up" and "reel 1 @ seated".

## Things a reviewer should push on
- The depth term in the floor model is my addition to the spec (the spec says "robust line fit in image
  space"). Rationale and measurements are in the results doc; it is what gets reel 3 to −68 %.
- Reel 1 seg 3 (lunge flow) misses the 70 % float target (−37 %). Diagnosis: planted hands and feet
  disagree by ~0.07 torso in an oblique view; I stopped rather than over-fit. Worth a second look.
- Hand-contact gating by the feet floor fixed a 2.7× inflation on the staff reel; check it doesn't hide
  real hand contacts in floor-heavy flows.
- boneJump "near 0" required smoothing the 3D track (same filter as 2D); the flagged share is ≤ 3.8 %.
- Depth flips went from up to 2.4/s to ≤ 0.71/s; the crossing legs of reel 3 should read clearly in the dev screen (not yet eyeballed on the phone by the owner).
- Combined flagged (2D + 3D rules) is 5.3 % / 6.0 % on two segments; the 3D rule alone is < 5 % everywhere.
- 3D smoothing uses a 1.0 s window — fine because the 3D track is never drawn, but say so if you disagree.

## How to verify quickly
```
nvm use && npm test            # 70+ tests
npm run eval                   # current (step 5) numbers
npm run eval -- --stage baseline
```
On the phone: Dev ▸ Figure renderer ▸ presets, toggle "raw (no pinning)".
