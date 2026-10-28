# Phase 0 — results (feasibility spike)

Status (2026-10-28): **GO.** Paste link → logged-in reel page → in-app ▶ Play → ReplayKit → MediaPipe
(GPU) → skeleton, proven on the owner's iPhone on real reels. Owner closed the reel count early
("we have a POC of what we need"): embed coverage is recorded as a finding, not a number.
Scope per owner (2026-10-27): tasks 1, 3, 4, 5, 7. Task 2 (share extension) and task 6 (logged-in
WebView) deferred; paste-URL field + "Pick a video from Photos" instead.

## Environment

| | |
|---|---|
| Mac | macOS 27.2, Xcode 27.1 (Build 27A9275), CocoaPods 1.17 |
| Node | **24.11.1 via nvm** (`.nvmrc`). The shell default is Node 14 — run `nvm use` first; Expo 58 needs ≥ 20 |
| Phone | iPhone 17 Pro Max (iPhone18,2), iOS 26.6.2, cable, Developer Mode on |
| Expo | SDK 58.0.20, React Native 0.88, expo-router 58, dev client, new architecture |
| Pose | MediaPipeTasksVision **0.10.35** (CocoaPods), `pose_landmarker_heavy.task` 30.7 MB bundled |
| Signing | Free Apple ID / Personal Team, bundle id `com.segev.movelab` |

## What was built

```
app/index.tsx            paste reel URL → Capture; "Pick a video from Photos" → Debug; reel log table + share
app/capture.tsx          WebView on https://www.instagram.com/reel/<code>/embed/captioned/ + injected JS
                         (username, caption, <video> rect, play/ended events) ; "Model it" = ReplayKit start,
                         auto-stop on video `ended` or manual ■ ; toggle to the plain reel page if the embed is blocked
app/debug.tsx            frame scrubber + raw 33 joints drawn with Skia ; Run MediaPipe / Run Vision ;
                         detected % + ms ; export JSON / share frame JPEG (screenshot proof) / delete video
modules/pose/            Swift: AVAssetReader → (rotate+crop with CoreImage) → MediaPipe PoseLandmarker heavy,
                         VIDEO mode, 33 landmarks px + visibility + z + world 3D ; Vision 2D mapped onto the
                         same 33 slots ; frameImage(t) ; progress events ; cpu/gpu delegate, 30/15 fps
modules/screen-recorder/ Swift: RPScreenRecorder start() / stop() → file:///…/recordings/rec-*.mp4
src/capture/embed.ts     URL parsing + the injected JS
src/capture/log.ts       phase0-capture-log.json (one row per reel: embed / video / recorded / MP % / Vision %)
```

Output format of `Pose.process()` = the reference format (`reference/sample-data/*_mp33.json`):
`{t, xy:[33][2] px, z:[33], v:[33], w:[33][3] m}` per frame, plus `{fps, width, height, stats}`.
Coordinates are in the **cropped** image when a crop rect is used.

Build commands:
```
nvm use                       # Node 24
npx expo run:ios --device     # first time: see "One-time signing step" below
npx expo start --dev-client   # Metro, in a second terminal (the dev client needs it)
```

## One-time signing step (blocks the device build until done)

`npx expo run:ios --device` stopped with `No code signing certificates are available to use.`
The Mac has no Apple Development certificate yet; only Xcode can create one for a Personal Team.

1. `open ios/MoveLab.xcworkspace`
2. Xcode ▸ Settings ▸ Accounts ▸ add your Apple ID if it is not there.
3. Select project **MoveLab** ▸ target **MoveLab** ▸ *Signing & Capabilities* ▸ tick *Automatically
   manage signing* ▸ Team = *Your Name (Personal Team)*. Xcode creates the certificate + profile.
   If the bundle id is taken, change it in `app.json` (`ios.bundleIdentifier`) and run `npx expo prebuild -p ios`.
4. Press ▶ once with the iPhone selected (Xcode mounts the Developer Disk Image, phone asks to trust
   the computer; then iPhone ▸ Settings ▸ General ▸ VPN & Device Management ▸ trust the developer app).
5. From then on `npx expo run:ios --device` works from the terminal.

Personal Team limits: app signature expires after 7 days (rebuild), max 3 app ids, no push / app groups
(no share extension anyway in this phase).

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | ≥ 10 reels: how many embed, how many record with visible video | **Closed early by owner (≈5 reels tried).** Embed plays inline only for some reels (observed: ones already in the owner's feed/followed accounts); Explore/linked reels show a poster + login wall. **Logged-in reel page played every reel tried** and recorded with visible video. Count the rest in Phase 4 with the real flow. |
| 2 | Recording contains the reel's video frames (not black), screenshot proof | **PASS** — Debug frames show the reel with its on-screen caption (owner screenshots 22:21, 22:26) |
| 3 | MediaPipe finds the person in ≥ 90 % of frames; compare with Vision | **PASS on the first real reel: 98.3 % (Vision 95.5 %)** — the 3 lab reels still to run via Photos picker |
| 4 | Burpee-lunge: raised leg in the push-up correct (heel/toe in the air) | **partial** — side-view plank from reel 1 looked right (floor foot heel+toe, far leg hidden); the lab burpee reel not yet run |
| 5 | Processing time for a 30 s recording on device | **PASS** — 7 ms/frame GPU, 18 ms/frame CPU → ≈ 9 s / 22 s per 30 s reel |
| 6 | GO / NO-GO + fallbacks | **GO.** Primary capture = logged-in reel page in a WebView (user's own session; no credential handling; no automation). Embed = no-login convenience. Fallback = iOS screen recording + Photos picker (works). Pose = MediaPipe heavy on GPU; Vision only as a sanity-check second opinion. |

## Carried into Phase 1 / Phase 4 (not blocking)
- Run the 3 lab reels (mobility / staff / burpee-lunge) through the Photos picker on the phone and save
  the JSONs to `reference/sample-data/phone/` — gives Phase 1 on-device fixtures for the raised-leg check.
- One recording start failed once with a ReplayKit error (exact text not captured); recorder now discards a
  stale session, retries once, and Capture has "Discard + reset recorder". Watch for it in Phase 4.
- ReplayKit frame rate is variable (39 fps observed): Phase 1 resamples by timestamp.
- Auto-stop = one loop of the reel (`timeupdate` wrap-around); reels never fire `ended`.

## Checklist used on 2026-10-28 (kept for reference)
1. `nvm use && npx expo start --dev-client` **before** opening the app (otherwise the red MIME-type screen).
   Native code changed tonight (memory fix) and is installed; no rebuild needed unless Swift changes again.
2. Embed count: paste 9 more reel links ▸ Open capture ▸ stay in *embed* mode ▸ use the app's **▶ Play video**
   button (not the poster). Log `video ✓/✗` per reel; try *Reload embed* once on failures. Home ▸ Share reel log.
3. Photos picker ▸ the 3 lab reels (mobility / staff / burpee-lunge) ▸ Run MediaPipe (GPU) ▸ note % and ms;
   burpee: scrub to the push-up, check the raised leg's green heel/toe. Export the 3 JSONs → `reference/sample-data/phone/`.
4. Check the auto-stop: the first recording stopped at 2.1 s once and 10.7 s on "manual stop" — verify
   whether the `ended` event fires early on looping reels (reels loop, so `ended` may never fire → rely on manual ■ or a timer).
5. Fill the table, write GO / NO-GO.

## What to test on the phone (in this order)

0. Do the one-time signing step above, then in two terminals:
   `nvm use && npx expo start --dev-client` and `nvm use && npx expo run:ios --device`.
   Home screen must show `model: found, 30.7 MB` and `ReplayKit available: true`.

1. **MediaPipe first (task 5, criteria 3–5).** Put the 3 lab reels (mobility, staff, burpee-lunge) in
   Photos as screen recordings. Home ▸ *Pick a video from Photos* ▸ Debug ▸ *Run MediaPipe (heavy)*.
   Note `detected/frames`, `ms`, `ms/frame`. Repeat with *GPU delegate* on, and with *15 fps*.
   Target: ≥ 90 % detected (prototype: 99 / 99.9 / 96.6 %). Then *Run Apple Vision (2D)* on the same
   file and note its numbers. *Export MP JSON* on each (AirDrop to the Mac) — these become Phase 1
   fixtures from the phone.
2. **Burpee-lunge feet (criterion 4).** Same Debug screen, scrub with ‹ frame / frame › to a push-up
   with one leg raised. Green dots = heel + toe. Pass if the raised leg's heel/toe are in the air and
   the legs are not merged. *Share this frame (JPEG)* for the write-up.
3. **Embed (task 3, criterion 1).** Home ▸ paste a reel URL ▸ *Open capture*. Read the grey panel:
   `user`, `caption`, `video: W×H @ (x,y) …` must appear after you tap play inside the embed. If the
   page says unavailable / login, tap *Embed blocked? Open reel page*. Do this for ≥ 10 reels from
   different accounts (public + private + one with embedding disabled, if you know one). Each attempt
   is logged automatically; Home ▸ *Share reel log (JSON)* at the end.
4. **Record (task 4, criterion 2).** On a reel that embeds: tap *Model it (record)* → allow the
   ReplayKit prompt → tap play in the embed → it auto-stops on `ended` (or press ■). The Debug screen
   opens on the recording with *crop to video rect* on. Scrub a few frames: the frame must show the
   reel, not black. *Share this frame (JPEG)* = the screenshot proof. Then *Run MediaPipe* on it and
   compare with the Photos-upload numbers (step 1). Note `wall` vs `duration` (recording lag).
5. **Timing (criterion 5).** Any ~30 s recording: MediaPipe cpu/30 fps, gpu/30 fps, cpu/15 fps.
   Target ≤ 60 s total; the prototype on 2 CPUs did 12 s of video in 17 s.
6. Fill the acceptance table above with the numbers and decide GO / NO-GO.

If something crashes: `npx expo run:ios --device` shows native logs; `Console.app` filtered on
`MoveLab` shows MediaPipe/ReplayKit messages.

## Findings so far (2026-10-27 evening, owner's phone)
- Signing done in Xcode; `npx expo run:ios --device` works. The dev client needs Metro running
  *before* the app opens, otherwise it falls back to a stale address (the red "Expected MIME-Type
  … got text/html" screen = some other device on the LAN answered on :8081).
- First real reel (DdMRBycMKUx, @romove.method), recorded in-app with ReplayKit, cropped to the
  embed's video rect (884×1104 of an 884×1920 recording, 10.73 s, 39.2 fps variable):

  | Run | Detected | Total | Per frame | Notes |
  |---|---|---|---|---|
  | MediaPipe heavy, CPU, 30 fps | 413/420 = **98.3 %** | 7574 ms | 18 ms | infer 6932 ms, init 94 ms |
  | MediaPipe heavy, **GPU** (Metal), 30 fps | 413/420 = **98.3 %** | **3014 ms** | **7 ms** | infer 2714 ms, init 1026 ms |
  | Apple Vision 2D (`VNDetectHumanBodyPoseRequest`) | 401/420 = 95.5 % | 3081 ms | 7 ms | no feet, no 3D |

  Extrapolated: a 30 s reel ≈ 22 s on CPU, ≈ 8–9 s on GPU → well under the 60 s target.
  Frames show the reel's video with its on-screen caption (not black); skeleton overlay correct for a
  side-view plank (floor-side heel + toe detected, far leg hidden). Screenshots: owner's phone, 22:21–22:27.
- **Bug found + fixed:** running MediaPipe on a longer Photos video was killed by iOS (critical memory
  pressure). Cause: autoreleased per-frame objects (sample buffer, MPImage, result) accumulated until
  the loop ended. Fix: `autoreleasepool` per frame + cancel the AVAssetReader on exit.

## 2026-10-28 — embed vs logged-in page (task 6 pulled into Phase 0)
- Embed (`/reel/<code>/embed/captioned/`): inline playback is **per-reel luck**. Reel 1 played; reel
  Ddo2_0IiOSG (and reels 2–4) only show a poster + "watch on Instagram" and require a session, with both
  the mobile and a desktop user agent.
- **Logged-in reel page works.** New `app/login.tsx`: the owner logs in to instagram.com inside the app's
  WebView (desktop UA, nothing injected, nothing read or stored; cookies stay in WKWebView's default store).
  Capture ▸ "Open reel page (logged-in)" then shows a real `<video>`; the app's ▶ Play button starts it,
  ReplayKit records, auto-stop after one loop (reels loop, `ended` never fires). Owner: "works really well".
- Decision for Phase 4: **primary route = logged-in reel page in a WebView; embed only as a no-login
  convenience.** Instagram ToS note: user-initiated viewing in the user's own session, no automation, no
  credential handling, skeletons only.

## Known limits of this spike (not bugs to fix now)
- The crop rect assumes the embed's CSS px map 1:1 onto points (corrected by viewport width / WebView width).
  If the figure looks offset, switch off "crop to video rect" in Debug and the whole screen is processed.
- ReplayKit records the whole app screen incl. status bar and the panel under the WebView; cropping removes it.
- Vision is the 2D request only (no feet, no 3D). Missing slots are `xy=[0,0], v=0`.
- The Photos picker copies the video into the app cache; "Delete video" removes the copy.
- ReplayKit records at the display rate (39 fps variable in tonight's capture), not the reel's 30 fps:
  the Phase 1 pipeline must resample by timestamp, not assume a fixed frame step.
- Instagram's embed poster on mobile fires an `instagram://` app link on tap; the WebView now refuses non-http
  navigations and the Capture panel has its own ▶ Play button that calls `video.play()`.

## Decisions / proposed doc changes
- Plan Phase 0: tasks 2 and 6 deferred (noted in `docs/03-implementation-plan.md`).
- Architecture §1: the model file is bundled from `modules/pose/ios/Models/` via the podspec
  (`assets/models/` stays the canonical copy); keep both in sync or symlink later.
