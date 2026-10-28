import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Figure } from './Figure';
import type { FigureClip } from './prepare';

/** Library card: loops the one-rep window (or the whole clip when not periodic), no HUD. */
export function FigureCard({ clip, width, height = Math.round(width * 1.25), speed = 1, style }: { clip: FigureClip; width: number; height?: number; speed?: number; style?: StyleProp<ViewStyle> }) {
  return <Figure clip={clip} width={width} height={height} loopWindow speed={speed} style={style} />;
}

/** Player: full clip, controls from the caller (playing / speed / mirror / HUD). */
export function FigurePlayer(props: { clip: FigureClip; width: number; height: number; playing?: boolean; speed?: number; mirror?: boolean; hud?: boolean; onFrame?: (f: number) => void; style?: StyleProp<ViewStyle> }) {
  return <Figure {...props} loopWindow={false} />;
}
