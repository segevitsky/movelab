import React from 'react';
import Animated, { FadeInDown, FadeInUp, FadeOut, LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';
import type { ViewProps } from 'react-native';

/** Staggered rise-in for list items (index-based delay, capped so long lists don't crawl). */
export function Rise({ index = 0, children, style, ...rest }: ViewProps & { index?: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 45).springify().damping(16)} exiting={FadeOut.duration(120)} layout={LinearTransition.springify().damping(18)} style={style} {...rest}>
      {children}
    </Animated.View>
  );
}

/** Drop-in for blocks that appear after an action (generate, review results). */
export function Drop({ index = 0, children, style, ...rest }: ViewProps & { index?: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 70).springify().damping(15)} exiting={FadeOut.duration(120)} layout={LinearTransition.springify().damping(18)} style={style} {...rest}>
      {children}
    </Animated.View>
  );
}

/** Pop for floating buttons / badges. */
export function Pop({ children, style, ...rest }: ViewProps & { children: React.ReactNode }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(12)} exiting={ZoomOut.duration(150)} style={style} {...rest}>
      {children}
    </Animated.View>
  );
}

export { Animated };
