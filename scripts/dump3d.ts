/**
 * Dump a fixture's figure as the renderer would see it, flat or from a yawed camera (Phase 14), for
 * scripts/preview.ts:  npx tsx scripts/dump3d.ts <raw-capture.json> <out.json> [yawDeg]
 * yawDeg omitted → the stored 2D view; with a yaw → clipFromView3d on the 3D track.
 */
import fs from 'node:fs';
import { processCapture } from '../src/pipeline';
import { playbackWindow } from '../src/pipeline/playback';
import { clipFromProcessed } from '../src/figure/fromPipeline';
import { downsampleClip, encodeClip, decodeClip } from '../src/figure/codec';
import { downsampleWorld } from '../src/figure/codec3d';
import { clipFromView3d, facingRatio } from '../src/figure/view3d';
const [, , inFile, outFile, yawArg] = process.argv;
const d = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const w = playbackWindow(d.timeline ?? []);
const frames = (d.result?.frames ?? d.frames).filter((f: any) => f.t >= w.start && f.t <= w.end);
const seg = processCapture({ frames })[0];
let clip = decodeClip(encodeClip(downsampleClip(clipFromProcessed(seg), 15)));
clip.scene = { floor: { a: seg.floor.a, b: seg.floor.b } };
const world = downsampleWorld(seg.worldClean, seg.fps, 15).world;
const facing = facingRatio(seg.xyFull, seg.worldClean);
let width = d.result?.width ?? 640, height = d.result?.height ?? 1024;
if (yawArg !== undefined) { clip = clipFromView3d(clip, world, { yawDeg: +yawArg, width: 640, height: 800 }); width = 640; height = 800; }
fs.writeFileSync(outFile, JSON.stringify({ fps: clip.fps, width, height, floor: clip.scene!.floor, xy: clip.xy }));
console.log(`facing ${facing.toFixed(2)} · ${clip.xy.length} frames · ${yawArg !== undefined ? `yaw ${yawArg}°` : 'flat'} → ${outFile}`);
