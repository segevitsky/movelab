/**
 * Compact storage of the cleaned 3D track (Phase 14): per frame 33 × (x, y, z) in millimetres as int16,
 * MediaPipe world coordinates (metres, hip-centred; x right, y down, z nearer < 0). Sentinel −32768 = unknown.
 * Layout: magic 'ML3D' (4) | fps f32 | nFrames u32 | per frame 33 × 3 × i16.
 */
import type { World } from '../pipeline/floor';

const MAGIC = 0x44334c4d; // 'M','L','3','D' little-endian
const NONE = -32768;
const Q = 1000; // mm

const clampI16 = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v)));

export function encodeWorld(world: World, fps: number): Uint8Array {
  const n = world.length;
  const buf = new ArrayBuffer(12 + n * 33 * 6);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint32(o, MAGIC, true); o += 4;
  dv.setFloat32(o, fps, true); o += 4;
  dv.setUint32(o, n, true); o += 4;
  for (let i = 0; i < n; i++) {
    const w = world[i];
    for (let j = 0; j < 33; j++) {
      const p = w?.[j];
      for (let c = 0; c < 3; c++) { const v = p && Number.isFinite(p[c]) ? clampI16(p[c] * Q) : NONE; dv.setInt16(o, v, true); o += 2; }
    }
  }
  return new Uint8Array(buf);
}

export function decodeWorld(bytes: Uint8Array): { fps: number; world: World } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  if (dv.getUint32(o, true) !== MAGIC) throw new Error('codec3d: bad magic');
  o += 4;
  const fps = dv.getFloat32(o, true); o += 4;
  const n = dv.getUint32(o, true); o += 4;
  const world: World = new Array(n);
  for (let i = 0; i < n; i++) {
    const fr: [number, number, number][] = new Array(33);
    let any = false;
    for (let j = 0; j < 33; j++) {
      const v = [0, 1, 2].map(() => { const x = dv.getInt16(o, true); o += 2; return x === NONE ? NaN : x / Q; }) as [number, number, number];
      if (Number.isFinite(v[0])) any = true;
      fr[j] = v;
    }
    world[i] = any ? fr : undefined;
  }
  return { fps, world };
}

/** Keep every k-th frame, exactly like downsampleClip does for the 2D track (same k → frames stay aligned). */
export function downsampleWorld(world: World, fps: number, targetFps = 15): { world: World; fps: number } {
  const k = Math.max(1, Math.round(fps / targetFps));
  if (k === 1) return { world, fps };
  return { world: world.filter((_, i) => i % k === 0), fps: fps / k };
}
