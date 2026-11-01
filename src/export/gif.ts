/**
 * Minimal animated-GIF encoder (pure TS, no deps): GIF89a, one global 256-colour palette, LZW per frame,
 * infinite loop. Input frames are RGBA byte arrays of the same size. Built for the stick-figure exports,
 * whose frames use a handful of flat colours plus anti-aliasing; a popularity palette on 5-bit bins is enough.
 */

export type RgbaFrame = Uint8Array | Uint8ClampedArray;

/** Pick up to 256 colours by popularity on 5-bit-per-channel bins, sampled across all frames. */
export function buildPalette(frames: RgbaFrame[], max = 256): Uint8Array {
  const counts = new Map<number, number>();
  const sums = new Map<number, [number, number, number]>();
  for (const f of frames) {
    for (let i = 0; i < f.length; i += 4 * 3) {
      // every 3rd pixel: sampling is enough for a palette
      const r = f[i], g = f[i + 1], b = f[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const s = sums.get(key);
      if (s) { s[0] += r; s[1] += g; s[2] += b; } else sums.set(key, [r, g, b]);
    }
  }
  const keys = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k);
  const pal = new Uint8Array(256 * 3);
  keys.forEach((k, i) => {
    const n = counts.get(k)!, s = sums.get(k)!;
    pal[i * 3] = Math.round(s[0] / n); pal[i * 3 + 1] = Math.round(s[1] / n); pal[i * 3 + 2] = Math.round(s[2] / n);
  });
  return pal;
}

/** Map RGBA pixels to palette indices (nearest colour, cached per 5-bit bin). */
export function indexFrame(f: RgbaFrame, pal: Uint8Array, cache: Map<number, number>): Uint8Array {
  const n = f.length / 4;
  const out = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const r = f[p * 4], g = f[p * 4 + 1], b = f[p * 4 + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let idx = cache.get(key);
    if (idx === undefined) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < 256; i++) {
        const dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; }
      }
      idx = best;
      cache.set(key, idx);
    }
    out[p] = idx;
  }
  return out;
}

/** GIF-flavoured LZW (variable code size, clear/EOI codes) of 8-bit indices, packed into 255-byte sub-blocks. */
export function lzwEncode(indices: Uint8Array, minCodeSize = 8): Uint8Array {
  const clear = 1 << minCodeSize, eoi = clear + 1;
  const out: number[] = [];
  let bitBuf = 0, bitCnt = 0;
  const emit = (code: number, size: number) => {
    bitBuf |= code << bitCnt;
    bitCnt += size;
    while (bitCnt >= 8) { out.push(bitBuf & 255); bitBuf >>>= 8; bitCnt -= 8; }
  };
  let dict = new Map<number, number>();
  let next = eoi + 1, codeSize = minCodeSize + 1;
  emit(clear, codeSize);
  if (indices.length === 0) { emit(eoi, codeSize); if (bitCnt > 0) out.push(bitBuf & 255); return pack(out); }
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const key = (prefix << 8) | c;
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix, codeSize);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear, codeSize);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = c;
  }
  emit(prefix, codeSize);
  emit(eoi, codeSize);
  if (bitCnt > 0) out.push(bitBuf & 255);
  return pack(out);
}

function pack(bytes: number[]): Uint8Array {
  const blocks = Math.ceil(bytes.length / 255);
  const out = new Uint8Array(bytes.length + blocks + 1);
  let o = 0;
  for (let i = 0; i < bytes.length; i += 255) {
    const n = Math.min(255, bytes.length - i);
    out[o++] = n;
    for (let j = 0; j < n; j++) out[o++] = bytes[i + j];
  }
  out[o++] = 0; // block terminator
  return out;
}

/** Encode RGBA frames (all width×height) into an infinitely looping GIF. `delayMs` per frame (≥ 20 ms in practice). */
export function encodeGif(frames: RgbaFrame[], width: number, height: number, delayMs: number): Uint8Array {
  const pal = buildPalette(frames);
  const cache = new Map<number, number>();
  const parts: Uint8Array[] = [];
  const push = (...bytes: number[]) => parts.push(Uint8Array.from(bytes));
  const u16 = (v: number) => [v & 255, (v >> 8) & 255];
  // header + logical screen descriptor (global colour table, 256 entries)
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...u16(width), ...u16(height), 0xf7, 0, 0);
  parts.push(pal);
  // NETSCAPE2.0 loop forever
  push(0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01, 0, 0, 0);
  const delay = Math.max(2, Math.round(delayMs / 10));
  for (const f of frames) {
    const idx = indexFrame(f, pal, cache);
    // graphic control extension: no disposal, no transparency
    push(0x21, 0xf9, 0x04, 0x00, ...u16(delay), 0, 0);
    // image descriptor (no local colour table)
    push(0x2c, 0, 0, 0, 0, ...u16(width), ...u16(height), 0);
    push(8); // LZW minimum code size
    parts.push(lzwEncode(idx, 8));
  }
  push(0x3b); // trailer
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
