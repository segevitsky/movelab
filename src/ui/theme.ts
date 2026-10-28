/** Warm, paper-like palette that matches the figure renderer; one colour per movement pattern. */
import type { Pattern, Slot } from '../db/vocab';

export const colors = {
  bg: '#f6f3ee',
  surface: '#ffffff',
  surfaceAlt: '#efebe4',
  ink: '#1c202c',
  inkSoft: '#2b3142',
  muted: '#7d8290',
  line: '#e3ded5',
  accent: '#2f6b8f', // deep steel blue — the app's single accent (owner rejected orange and yellow)
  accentSoft: '#dde8f0',
  danger: '#b3261e',
  success: '#2e8b57',
};

export const patternColor: Record<Pattern, string> = {
  push: '#e0633a',
  pull: '#2f6fd6',
  squat: '#3a9d5d',
  hinge: '#2d8c7f',
  lunge: '#7fb241',
  core: '#e0a52b',
  rotation: '#c85c9e',
  carry: '#8a6d3b',
  locomotion: '#5aa6d6',
  mobility: '#2bb3a3',
  stretch: '#7a8fd1',
  skill: '#8e5bd6',
  cardio: '#d64545',
  balance: '#b08d2f',
};

export const slotColor: Partial<Record<Slot, string>> = {
  warmup: '#f0b44c',
  skill: '#8e5bd6',
  strength: '#444b5c',
  pull: '#2f6fd6',
  push: '#e0633a',
  legs: '#3a9d5d',
  core: '#e0a52b',
  cardio: '#d64545',
  mobility: '#2bb3a3',
  locomotion: '#5aa6d6',
  stretch: '#7a8fd1',
  cooldown: '#7a8fd1',
};

/** Soft tint for a strong colour (for chip backgrounds). */
export function tint(hex: string, alpha = 0.16) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export const radius = { s: 8, m: 12, l: 16, xl: 22 };
export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
};
