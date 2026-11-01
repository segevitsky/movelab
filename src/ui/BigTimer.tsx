import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors, motion, type } from './theme';

export type TimerState = 'work' | 'rest' | 'paused';

/**
 * The player countdown (docs/06 §3): display type sized for 1.5 m (168 pt, 160 on narrow phones), tabular
 * numerals, always LTR. Colour says the state (work = accent, rest = blue-grey, paused = dim); the last
 * 3 seconds pulse. `flash` paints the digits accent for the "go" beat. Respects Reduce Motion.
 */
export function BigTimer({ seconds, state, flash, progress, style, size: sizeProp }: {
  seconds: number; state: TimerState; flash?: boolean;
  /** digit font size; default 168 (160 on narrow phones) */
  size?: number;
  /** 0..1 of the current step, drawn as a 6 pt bar under the digits */
  progress: number; style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const size = sizeProp ?? (width < 390 ? 160 : type.display.fontSize);
  const scale = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (reduceMotion || state === 'paused' || seconds > 3 || seconds <= 0) return;
    scale.value = withSequence(withTiming(1.06, { duration: 80, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 160, easing: Easing.inOut(Easing.quad) }));
  }, [seconds, state, reduceMotion]);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const color = flash ? colors.accent : state === 'work' ? colors.accent : state === 'rest' ? colors.rest : colors.muted;
  const barColor = state === 'rest' ? colors.rest : colors.accent;
  const lastSeconds = seconds <= 3 && seconds > 0 && state !== 'paused';
  return (
    <View style={[styles.wrap, style]}>
      <Animated.Text
        style={[styles.digits, { fontSize: size, lineHeight: Math.round(size * 1.05), color, opacity: state === 'paused' ? 0.5 : 1 }, pulse]}
        numberOfLines={1}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${seconds} seconds`}
      >
        {Math.max(0, seconds)}
      </Animated.Text>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, progress * 100))}%`, backgroundColor: lastSeconds ? colors.accent : barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  digits: { ...type.display, writingDirection: 'ltr', textAlign: 'center', includeFontPadding: false },
  bar: { width: '70%', height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});

/** Duration used by the player when it animates a step change. */
export const TIMER_STEP_MS = motion.standard;
