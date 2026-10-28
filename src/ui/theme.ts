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
  danger: '#8f3f33', // brick, not alarm red
  success: '#5d7a62', // moss
};

export const patternColor: Record<Pattern, string> = {
  push: '#b5674d', // terracotta
  pull: '#3f6a82', // petrol
  squat: '#7a8a4c', // olive
  hinge: '#5d7a62', // moss
  lunge: '#8e9a72', // sage
  core: '#b48a2e', // ochre
  rotation: '#7f5c7c', // plum
  carry: '#8a6a4b', // umber
  locomotion: '#5c8c8f', // dusty teal
  mobility: '#4e8f86', // sea
  stretch: '#7c7f9d', // lavender grey
  skill: '#8c4d5e', // wine
  cardio: '#a4553c', // rust
  balance: '#a69262', // sand
};

export const slotColor: Partial<Record<Slot, string>> = {
  warmup: '#b48a2e',
  skill: '#8c4d5e',
  strength: '#4b5160',
  pull: '#3f6a82',
  push: '#b5674d',
  legs: '#7a8a4c',
  core: '#b48a2e',
  cardio: '#a4553c',
  mobility: '#4e8f86',
  locomotion: '#5c8c8f',
  stretch: '#7c7f9d',
  cooldown: '#7c7f9d',
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
