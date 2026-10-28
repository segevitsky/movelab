import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { COLORS, recordPictures } from './draw';
import { prepare, type FigureClip } from './prepare';

export type FigureProps = {
  clip: FigureClip;
  width: number;
  height: number;
  playing?: boolean;
  /** 1 = real time */
  speed?: number;
  mirror?: boolean;
  /** loop only the clip's loop window (cards) or the whole clip (player) */
  loopWindow?: boolean;
  /** show the two-joint angle HUD (needs clip.hud) */
  hud?: boolean;
  floor?: boolean;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  /** called at most ~10×/s with the current frame index */
  onFrame?: (frame: number) => void;
};

/**
 * Stick-figure player. Every frame is pre-recorded as a Skia picture once per (clip, size, mirror);
 * playback advances a shared value on the UI thread, so React never re-renders per frame.
 */
export function Figure({ clip, width, height, playing = true, speed = 1, mirror = false, loopWindow = true, hud = false, floor = true, shadow = true, style, onFrame }: FigureProps) {
  const prep = useMemo(() => prepare(clip, width, height), [clip, width, height]);
  const pictures = useMemo(() => recordPictures(prep, { mirror, floor, shadow }), [prep, mirror, floor, shadow]);
  const i0 = loopWindow ? prep.loop.i0 : 0;
  const n = loopWindow ? prep.loop.i1 - prep.loop.i0 + 1 : prep.frames.length;
  const fps = prep.fps;

  const frame = useSharedValue(0); // fractional frame within the loop window
  const playingSV = useSharedValue(playing);
  const speedSV = useSharedValue(speed);
  useEffect(() => { playingSV.value = playing; }, [playing, playingSV]);
  useEffect(() => { speedSV.value = speed; }, [speed, speedSV]);

  useFrameCallback((info) => {
    if (!playingSV.value || !info.timeSincePreviousFrame) return;
    const dt = Math.min(0.1, info.timeSincePreviousFrame / 1000);
    frame.value = (frame.value + dt * fps * speedSV.value) % n;
  });

  const picture = useDerivedValue(() => pictures[i0 + Math.floor(frame.value)] ?? pictures[i0], [pictures, i0, n]);

  const [hudText, setHudText] = useState<string[]>([]);
  const [, setTick] = useState(0);
  useAnimatedReaction(
    () => Math.floor(frame.value / 3),
    (cur, prev) => {
      if (cur !== prev) runOnJS(frameTick)(i0 + Math.floor(frame.value));
    },
    [i0],
  );
  function frameTick(k: number) {
    onFrame?.(k);
    if (hud && clip.hud) setHudText(clip.hud.map((h) => `${h.name} ${Math.round(h.angles[k] / 5) * 5}°`));
    setTick((x) => x + 1);
  }

  return (
    <View style={[{ width, height, backgroundColor: COLORS.bg, overflow: 'hidden' }, style]}>
      <Canvas style={{ width, height }}>
        <Picture picture={picture} />
      </Canvas>
      {hud && clip.hud && (
        <View style={styles.hud} pointerEvents="none">
          {hudText.map((t, i) => (
            <Text key={i} style={[styles.hudText, { fontSize: Math.max(12, height * 0.045) }]}>{t}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { position: 'absolute', top: 8, right: 10, alignItems: 'flex-end' },
  hudText: { color: COLORS.accent, fontWeight: '800', fontVariant: ['tabular-nums'] },
});

/** Frames per second on the UI thread, reported once a second (for the Phase 2 acceptance check). */
export function useFps(): number {
  const [fps, setFps] = useState(0);
  const count = useSharedValue(0);
  const since = useSharedValue(0);
  useFrameCallback((info) => {
    count.value += 1;
    since.value += info.timeSincePreviousFrame ?? 0;
    if (since.value >= 1000) {
      runOnJS(setFps)(Math.round((count.value * 1000) / since.value));
      count.value = 0;
      since.value = 0;
    }
  });
  return fps;
}
