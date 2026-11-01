/**
 * Design tokens (docs/06-design-direction.md §3). Dark-first: the app chrome is a dark room, the figure keeps
 * its warm paper stage (src/figure/draw.ts COLORS is untouched) and is the one bright object on screen.
 * One accent. Pattern colours appear only as thin stripes, selected chips and one tag per row.
 */
import type { TextStyle } from 'react-native';
import type { Pattern, Slot } from '../db/vocab';

export const dark = {
  bg: '#0e1014', // near-black, slightly warm-neutral (not pure black: the paper stage must not glow)
  surface: '#171a21', // cards, bars, sheets
  surfaceAlt: '#1f232c', // pressed / nested surfaces, chips off
  line: 'rgba(255,255,255,0.08)',
  ink: '#f2f1ec', // primary text (warm white, same family as the paper)
  inkSoft: '#c9cbd1',
  muted: '#8a8f9b', // secondary text, inactive icons
  accent: '#4f93bf', // steel blue lifted for dark backgrounds (same hue as the old #2f6b8f)
  accentDeep: '#2f6b8f', // accent fills behind white text (buttons)
  accentSoft: 'rgba(79,147,191,0.16)',
  rest: '#6f7f91', // rest-state timer and bar: blue-grey, clearly not the accent
  danger: '#c2584a',
  success: '#7fa386',
  paper: '#f6f3ee', // the figure stage (= draw.ts COLORS.bg); used only for things placed *on* the stage
  onAccent: '#ffffff',
} as const;

export type Colors = { [K in keyof typeof dark]: string };

/** The active theme. Structured so a light theme can be added later without touching screens. */
export const colors: Colors = dark;

/** Movement-pattern colours, lifted for text on dark backgrounds. */
export const patternColor: Record<Pattern, string> = {
  push: '#d07d61', // terracotta
  pull: '#5f93b0', // petrol
  squat: '#9bad63', // olive
  hinge: '#7fa386', // moss
  lunge: '#a9b78c', // sage
  core: '#d4a63f', // ochre
  rotation: '#a57ca2', // plum
  carry: '#ad8a66', // umber
  locomotion: '#79afb3', // dusty teal
  mobility: '#67b2a8', // sea
  stretch: '#9fa2c2', // lavender grey
  skill: '#b56a7d', // wine
  cardio: '#c76f55', // rust
  balance: '#c2ae7c', // sand
};

export const slotColor: Partial<Record<Slot, string>> = {
  warmup: patternColor.core,
  skill: patternColor.skill,
  strength: '#9aa1b0',
  pull: patternColor.pull,
  push: patternColor.push,
  legs: patternColor.squat,
  core: patternColor.core,
  cardio: patternColor.cardio,
  mobility: patternColor.mobility,
  locomotion: patternColor.locomotion,
  stretch: patternColor.stretch,
  cooldown: patternColor.stretch,
};

/** Translucent version of a hex colour (chip fills, soft backgrounds). */
export function tint(hex: string, alpha = 0.16) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Type scale: system font, heavy weights, tabular numerals where numbers change. Nothing under 12. */
export const type = {
  display: { fontSize: 168, lineHeight: 176, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -4 },
  h1: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.3 },
  h3: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} satisfies Record<string, TextStyle>;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { s: 8, m: 12, l: 16, xl: 24, pill: 999 } as const;
/** Minimum hit targets (pt). */
export const hit = { min: 44, control: 64, primary: 88, gap: 24 } as const;
/** Motion durations (ms). */
export const motion = { micro: 120, standard: 220, screen: 320, flash: 450 } as const;

/** No drop shadows on dark: surfaces step instead. Kept as a style for call sites that spread it. */
export const shadow = { card: {} as Record<string, never> };
