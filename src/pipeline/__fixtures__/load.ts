/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RawFrame } from '../types';

const ROOT = join(__dirname, '..', '..', '..');

export function loadReel(name: 'reel1_mobility_mp33' | 'reel2_staff_mp33' | 'reel3_burpee_mp33'): RawFrame[] {
  return JSON.parse(readFileSync(join(ROOT, 'reference', 'sample-data', `${name}.json`), 'utf8'));
}

export function loadPhoneReel(): RawFrame[] {
  return JSON.parse(readFileSync(join(ROOT, 'reference', 'sample-data', 'phone', 'reel4_plank_romove_mp33_phone.json'), 'utf8')).frames;
}

export type ExpectedSegment = {
  a: number;
  b: number;
  t: number[];
  clean_xy: number[][][]; // [frame][17][2]
  near: number[];
  period?: { period: number; lag: number; score: number; periodic: boolean } | null;
  loop?: { i0: number; i1: number; err: number; t0: number; t1: number };
  feet_toe?: { xy: ([number, number] | null)[][]; ok: number[][] };
  feet_heel?: { xy: ([number, number] | null)[][]; ok: number[][] };
  top_joints: { range: number; name: string; side: number; tri: number[] }[];
};

export function loadExpected(name: string): { fps: number; segments: ExpectedSegment[] } {
  return JSON.parse(readFileSync(join(__dirname, 'expected', `${name}.expected.json`), 'utf8'));
}

export function loadMathExpected(): any {
  return JSON.parse(readFileSync(join(__dirname, 'expected', 'math.expected.json'), 'utf8'));
}

/** Same frame selection the Python reference used: a <= t <= b. */
export function framesBetween(frames: RawFrame[], a: number, b: number): RawFrame[] {
  return frames.filter((f) => f.t >= a && f.t <= b);
}
