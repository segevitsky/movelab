/**
 * Contact sheet of a processed track (from a dump: { fps, width, height, floor, xy }) as a PNG, no deps:
 *   npx tsx scripts/preview.ts <dump.json> <out.png> [cols] [rows]
 * Draws the figure's bones and the fitted floor line (at z = 0) so a float / sink is visible at a glance.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
const [, , inFile, outFile, colsArg = '4', rowsArg = '3'] = process.argv;
const d = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const cols = +colsArg, rows = +rowsArg, cellW = 180, cellH = Math.round((cellW * d.height) / d.width);
const W = cols * cellW, H = rows * cellH;
const img = Buffer.alloc(W * H * 3, 0xf4);
const put = (x: number, y: number, r: number, g: number, b: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; };
const line = (fx0: number, fy0: number, fx1: number, fy1: number, c: [number, number, number], thick = 1) => {
  let x = Math.round(fx0), y = Math.round(fy0); const ex = Math.round(fx1), ey = Math.round(fy1);
  const dx = Math.abs(ex - x), dy = -Math.abs(ey - y), sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1; let err = dx + dy;
  for (let k = 0; k < 4000; k++) { for (let a = -thick; a <= thick; a++) for (let b = -thick; b <= thick; b++) put(x + a, y + b, ...c); if (x === ex && y === ey) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; } }
};
const circle = (cx: number, cy: number, r: number, c: [number, number, number]) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r) put(Math.round(cx) + a, Math.round(cy) + b, ...c); };
const BONES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [27, 31], [28, 30], [28, 32]];
const n = d.xy.length, k = cols * rows;
for (let i = 0; i < k; i++) {
  const fi = Math.min(n - 1, Math.round((i / Math.max(1, k - 1)) * (n - 1)));
  const f = d.xy[fi];
  const ox = (i % cols) * cellW, oy = Math.floor(i / cols) * cellH, sc = cellW / d.width;
  // cell border
  line(ox, oy, ox + cellW - 1, oy, [200, 200, 200]); line(ox, oy, ox, oy + cellH - 1, [200, 200, 200]);
  // floor line at z = 0
  const fy = (x: number) => d.floor.a * x + d.floor.b;
  line(ox, oy + fy(0) * sc, ox + cellW - 1, oy + fy(d.width) * sc, [120, 160, 200], 0);
  if (Number.isFinite(f[0][0])) circle(ox + f[0][0] * sc, oy + f[0][1] * sc, 4, [28, 32, 44]);
  for (const [a, b] of BONES) { const p = f[a], q = f[b]; if (!Number.isFinite(p[0]) || !Number.isFinite(q[0])) continue; const right = a % 2 === 0; line(ox + p[0] * sc, oy + p[1] * sc, ox + q[0] * sc, oy + q[1] * sc, right ? [28, 32, 44] : [128, 134, 150], 1); }
  // frame index tick (height ∝ time)
  line(ox + 2, oy + cellH - 2, ox + 2 + Math.round((fi / n) * (cellW - 4)), oy + cellH - 2, [90, 90, 90], 0);
}
// PNG
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf: Buffer) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
fs.writeFileSync(outFile, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${outFile} (${W}×${H}, ${k} frames of ${n})`);
