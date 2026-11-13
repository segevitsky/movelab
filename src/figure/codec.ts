/**
 * Compact storage of a FigureClip (Architecture §5: 15 fps, 33 landmarks int16 → ≈ 2 KB/s).
 * Pure TS, no native. Layout (little-endian):
 *   magic 'MLF1' (4) | fps f32 | nFrames u32 | loopI0 i32 | loopI1 i32 |
 *   flags u8 (bit0: feet, bit1: depth, bit2: staff, bit3: hands, bit4: small toes)
 *   per frame: 33 × (x i16, y i16) [+ toeL toeR heelL heelR × (x i16, y i16), sentinel -32768 = none]
 *             [+ depth u8: bit0 legsRightNear, bit1 armsRightNear]
 *             [+ staff: a (x i16, y i16), b (x i16, y i16), behind u8]  (Phase 16 props)
 *             [+ hands: 2 × 21 × (x i16, y i16)]  [+ small toes: L R × (x i16, y i16)]  (Phase 17 step 3)
 * Coordinates are stored in 1/4 px (int16 range ±8192 px).
 */
import type { FootTrack, HandTrack, XY } from '../pipeline/types';
import { HAND_POINTS } from '../pipeline/hands';
import type { FigureClip, StaffProp } from './prepare';

const MAGIC = 0x314c4d46; // 'FML1' little-endian read of 'F','M','L','1'
const NONE = -32768;
const Q = 4; // quarter-pixel

function clampI16(v: number) {
  return Math.max(-32767, Math.min(32767, Math.round(v)));
}

export function encodeClip(clip: FigureClip): Uint8Array {
  const n = clip.xy.length;
  const feet = !!(clip.toes || clip.heels);
  const depth = !!clip.depth;
  const staff = clip.props?.staff;
  const hands = !!clip.hands;
  const small = !!clip.smallToes;
  const perFrame = 33 * 4 + (feet ? 4 * 4 : 0) + (depth ? 1 : 0) + (staff ? 9 : 0) + (hands ? 2 * HAND_POINTS * 4 : 0) + (small ? 2 * 4 : 0);
  const buf = new ArrayBuffer(21 + n * perFrame);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint32(o, MAGIC, true); o += 4;
  dv.setFloat32(o, clip.fps, true); o += 4;
  dv.setUint32(o, n, true); o += 4;
  dv.setInt32(o, clip.loop?.i0 ?? 0, true); o += 4;
  dv.setInt32(o, clip.loop?.i1 ?? n - 1, true); o += 4;
  dv.setUint8(o, (feet ? 1 : 0) | (depth ? 2 : 0) | (staff ? 4 : 0) | (hands ? 8 : 0) | (small ? 16 : 0)); o += 1;
  const put = (p: XY | null) => {
    if (!p || Number.isNaN(p[0]) || Number.isNaN(p[1])) { dv.setInt16(o, NONE, true); dv.setInt16(o + 2, NONE, true); }
    else { dv.setInt16(o, clampI16(p[0] * Q), true); dv.setInt16(o + 2, clampI16(p[1] * Q), true); }
    o += 4;
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 33; j++) put(clip.xy[i][j]);
    if (feet) {
      put(clip.toes?.xy[i][0] ?? null);
      put(clip.toes?.xy[i][1] ?? null);
      put(clip.heels?.xy[i][0] ?? null);
      put(clip.heels?.xy[i][1] ?? null);
    }
    if (depth) { dv.setUint8(o, (clip.depth!.legsRightNear[i] ? 1 : 0) | (clip.depth!.armsRightNear[i] ? 2 : 0)); o += 1; }
    if (staff) { put(staff.a[i] ?? null); put(staff.b[i] ?? null); dv.setUint8(o, staff.behind[i] ? 1 : 0); o += 1; }
    if (hands) for (let s = 0; s < 2; s++) { const h = clip.hands!.xy[i][s]; for (let j = 0; j < HAND_POINTS; j++) put(h ? h[j] ?? null : null); }
    if (small) { put(clip.smallToes!.xy[i][0] ?? null); put(clip.smallToes!.xy[i][1] ?? null); }
  }
  return new Uint8Array(buf);
}

export function decodeClip(bytes: Uint8Array): FigureClip {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  if (dv.getUint32(o, true) !== MAGIC) throw new Error('codec: bad magic');
  o += 4;
  const fps = dv.getFloat32(o, true); o += 4;
  const n = dv.getUint32(o, true); o += 4;
  const i0 = dv.getInt32(o, true); o += 4;
  const i1 = dv.getInt32(o, true); o += 4;
  const flags = dv.getUint8(o); o += 1;
  const feet = (flags & 1) === 1;
  const hasDepth = (flags & 2) === 2;
  const hasStaff = (flags & 4) === 4;
  const hasHands = (flags & 8) === 8;
  const hasSmall = (flags & 16) === 16;
  const hands: HandTrack = { xy: [], ok: [] };
  const smallToes: FootTrack = { xy: [], ok: [] };
  const legsRightNear: boolean[] = [], armsRightNear: boolean[] = [];
  const staff: StaffProp = { a: [], b: [], behind: [] };
  const get = (): XY | null => {
    const x = dv.getInt16(o, true);
    const y = dv.getInt16(o + 2, true);
    o += 4;
    return x === NONE ? null : [x / Q, y / Q];
  };
  const xy: XY[][] = new Array(n);
  const toes: FootTrack = { xy: [], ok: [] };
  const heels: FootTrack = { xy: [], ok: [] };
  for (let i = 0; i < n; i++) {
    const fr: XY[] = new Array(33);
    for (let j = 0; j < 33; j++) fr[j] = get() ?? [NaN, NaN];
    xy[i] = fr;
    if (feet) {
      const tl = get(), tr = get(), hl = get(), hr = get();
      toes.xy.push([tl, tr]); toes.ok.push([!!tl, !!tr]);
      heels.xy.push([hl, hr]); heels.ok.push([!!hl, !!hr]);
    }
    if (hasDepth) { const b = dv.getUint8(o); o += 1; legsRightNear.push((b & 1) === 1); armsRightNear.push((b & 2) === 2); }
    if (hasStaff) { staff.a.push(get()); staff.b.push(get()); staff.behind.push(dv.getUint8(o) === 1); o += 1; }
    if (hasHands) {
      const sides: ((XY | null)[] | null)[] = [];
      for (let s = 0; s < 2; s++) { const h: (XY | null)[] = []; for (let j = 0; j < HAND_POINTS; j++) h.push(get()); sides.push(h.some((p) => p) ? h : null); }
      hands.xy.push(sides); hands.ok.push([!!sides[0], !!sides[1]]);
    }
    if (hasSmall) { const l = get(), r = get(); smallToes.xy.push([l, r]); smallToes.ok.push([!!l, !!r]); }
  }
  return { fps, xy, toes: feet ? toes : undefined, heels: feet ? heels : undefined, loop: { i0, i1 }, depth: hasDepth ? { legsRightNear, armsRightNear } : undefined, props: hasStaff ? { staff } : undefined, hands: hasHands ? hands : undefined, smallToes: hasSmall ? smallToes : undefined };
}

/** Keep every k-th frame so the stored clip runs at ≈ targetFps (loop indices rescaled). */
export function downsampleClip(clip: FigureClip, targetFps = 15): FigureClip {
  const k = Math.max(1, Math.round(clip.fps / targetFps));
  if (k === 1) return clip;
  const pick = (i: number) => i % k === 0;
  const idx = clip.xy.map((_, i) => i).filter(pick);
  return {
    fps: clip.fps / k,
    xy: idx.map((i) => clip.xy[i]),
    toes: clip.toes ? { xy: idx.map((i) => clip.toes!.xy[i]), ok: idx.map((i) => clip.toes!.ok[i]) } : undefined,
    heels: clip.heels ? { xy: idx.map((i) => clip.heels!.xy[i]), ok: idx.map((i) => clip.heels!.ok[i]) } : undefined,
    smallToes: clip.smallToes ? { xy: idx.map((i) => clip.smallToes!.xy[i]), ok: idx.map((i) => clip.smallToes!.ok[i]) } : undefined,
    hands: clip.hands ? { xy: idx.map((i) => clip.hands!.xy[i]), ok: idx.map((i) => clip.hands!.ok[i]) } : undefined,
    loop: clip.loop ? { i0: Math.floor(clip.loop.i0 / k), i1: Math.floor(clip.loop.i1 / k) } : undefined,
    hud: clip.hud?.map((h) => ({ name: h.name, angles: idx.map((i) => h.angles[i]) })),
    depth: clip.depth ? { legsRightNear: idx.map((i) => clip.depth!.legsRightNear[i]), armsRightNear: idx.map((i) => clip.depth!.armsRightNear[i]) } : undefined,
    scene: clip.scene,
    props: clip.props?.staff ? { staff: { a: idx.map((i) => clip.props!.staff!.a[i]), b: idx.map((i) => clip.props!.staff!.b[i]), behind: idx.map((i) => clip.props!.staff!.behind[i]) } } : undefined,
  };
}

/** base64 helpers (SQLite text column; no Buffer in Hermes). */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const triplet = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(triplet >> 18) & 63] + B64[(triplet >> 12) & 63] + (b === undefined ? '=' : B64[(triplet >> 6) & 63]) + (c === undefined ? '=' : B64[triplet & 63]);
  }
  return out;
}
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out[o++] = (v >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (v >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = v & 255;
  }
  return out.subarray(0, o);
}
