import { describe, expect, it } from 'vitest';
import { buildPalette, encodeGif, indexFrame, lzwEncode } from './gif';

/** Reference GIF-LZW decoder (for the test only). */
function lzwDecode(blocks: Uint8Array, minCodeSize: number, expected: number): number[] {
  // unpack sub-blocks
  const bytes: number[] = [];
  let i = 0;
  while (i < blocks.length) {
    const n = blocks[i++];
    if (n === 0) break;
    for (let j = 0; j < n; j++) bytes.push(blocks[i++]);
  }
  const clear = 1 << minCodeSize, eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => { dict = []; for (let k = 0; k < clear; k++) dict.push([k]); dict.push([], []); codeSize = minCodeSize + 1; };
  reset();
  const out: number[] = [];
  let bitPos = 0;
  const read = () => {
    let v = 0;
    for (let b = 0; b < codeSize; b++) {
      const byte = bytes[(bitPos + b) >> 3];
      v |= ((byte >> ((bitPos + b) & 7)) & 1) << b;
    }
    bitPos += codeSize;
    return v;
  };
  let prev: number[] | null = null;
  while (out.length < expected) {
    const code = read();
    if (code === clear) { reset(); prev = null; continue; }
    if (code === eoi) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev) entry = [...prev, prev[0]];
    else throw new Error('bad code');
    out.push(...entry);
    if (prev) {
      dict.push([...prev, entry[0]]);
      if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}

describe('gif encoder', () => {
  it('LZW round-trips random and repetitive index streams', () => {
    const streams = [
      new Uint8Array([0, 0, 0, 0, 1, 1, 1, 2, 2, 3]),
      Uint8Array.from({ length: 5000 }, (_, i) => (i * 7919) % 11),
      Uint8Array.from({ length: 20000 }, (_, i) => (i % 97 < 50 ? 3 : (i * 31) % 256)),
      new Uint8Array(0),
    ];
    for (const s of streams) {
      const enc = lzwEncode(s, 8);
      expect(lzwDecode(enc, 8, s.length)).toEqual([...s]);
    }
  });

  it('builds a palette with the most common colours first and maps pixels to them', () => {
    const px = (r: number, g: number, b: number) => [r, g, b, 255];
    const frame = Uint8Array.from([...Array(30).fill(px(246, 243, 238)), ...Array(10).fill(px(28, 32, 44)), ...Array(3).fill(px(128, 134, 150))].flat());
    const pal = buildPalette([frame]);
    expect([pal[0], pal[1], pal[2]]).toEqual([246, 243, 238]);
    expect([pal[3], pal[4], pal[5]]).toEqual([28, 32, 44]);
    const idx = indexFrame(frame, pal, new Map());
    expect(idx[0]).toBe(0);
    expect(idx[30]).toBe(1);
    expect(idx[40]).toBe(2);
  });

  it('writes a GIF89a with a loop extension and one image per frame', () => {
    const w = 4, h = 3;
    const frame = (v: number) => Uint8Array.from(Array(w * h).fill([v, v, v, 255]).flat());
    const gif = encodeGif([frame(10), frame(200)], w, h, 100);
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
    expect(gif[6] | (gif[7] << 8)).toBe(w);
    expect(gif[8] | (gif[9] << 8)).toBe(h);
    expect(gif[gif.length - 1]).toBe(0x3b);
    // NETSCAPE2.0 app extension present
    const s = Array.from(gif, (b) => String.fromCharCode(b)).join('');
    expect(s.includes('NETSCAPE2.0')).toBe(true);
    // two image descriptors (0x2c at the start of a descriptor after a GCE)
    let descriptors = 0;
    for (let i = 0; i < gif.length - 8; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4 && gif[i + 8] === 0x2c) descriptors++;
    expect(descriptors).toBe(2);
  });
});
