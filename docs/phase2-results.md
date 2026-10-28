# Phase 2 — results (figure renderer)

Status (2026-10-28): **done; both acceptance criteria met on the owner's iPhone 17 Pro Max.**
Screenshot: `docs/phase2-figures-phone.png`.

## Acceptance

| Criterion | Result |
|---|---|
| Visually matches `reference/renders/*_mp.gif` (fixed colours, heel–toe feet, perspective floor, cast shadow) | **PASS** — same palette and geometry as `render.py` (right side dark `#1c202c`, left grey `#808696`, torso `#2b3142`, floor grid to a vanishing point, projected shadow, front limbs outlined in the background colour, ankle–heel–toe triangles only when both are detected). Owner: "this is insane!" |
| 60 fps on device with 3 cards looping | **PASS** — UI-thread frame callback reports **~120 fps** (ProMotion) with 3 cards + a full-width player looping, HUD on. React does not re-render per frame. |

## How it works (`src/figure`)
- `prepare.ts` (pure, tested): per-clip torso/thickness unit, 97th-percentile ground line, steady head
  centre (neck extension ⊕ face centre, smoothed 0.5 s), follow-cam with a constant scale per clip and a
  2 s-smoothed horizontal centre, ground anchored at 87 % of the viewport height, shadow projection.
- `draw.ts`: draws one prepared frame on a Skia canvas (floor → shadow → far limbs → torso → near limbs
  with outline). `recordPictures()` records every frame as an `SkPicture` once per (clip, size, mirror).
- `Figure.tsx`: a Reanimated `useFrameCallback` advances a fractional frame index on the UI thread;
  `useDerivedValue` picks the picture; `<Picture>` draws it. Props: `playing`, `speed`, `mirror`,
  `loopWindow` (cards loop the one-rep window from Phase 1, player loops the whole clip), `hud`
  (two most active joints, rounded to 5°, updated ≤ 10×/s), `onFrame`.
- `variants.tsx`: `FigureCard` (library grid) and `FigurePlayer` (full screen, Phase 6).
- `fromPipeline.ts`: `clipFromProcessed()` turns a Phase 1 `ProcessedSegment` into a clip (loop + HUD angles).
- Dev screen `app/figures.tsx`: runs the pipeline on the 3 fixture reels (≈1 s on device), shows 3 cards
  + player, fps readout, play/pause, 0.5×/1×/2×, mirror, HUD.

## Notes / carried forward
- Pictures are recorded on the JS thread at mount (≈300 frames × ~120 draw ops); fine for a dev screen and
  a handful of cards. A grid of 60 cards (Phase 3) should record lazily (visible cards only) and/or at 15 fps
  from the stored skeleton — measure before optimising.
- Storage format (Phase 3): 15 fps int16 landmarks per Architecture §5; `FigureClip` takes any fps.
- Props (staff cylinder) are not drawn — parking lot, as planned.
- Build note: react-native-reanimated 4.7 + react-native-worklets 0.13.0 were added (native rebuild). If
  Metro reports a "Worklets Babel plugin version" mismatch after dependency changes, restart it with
  `npx expo start --dev-client --clear`.
