import React, { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius } from './theme';

/**
 * Reorder by drag, pure JS (gesture-handler does not link here): long-press a row to lift it, drag up or
 * down, release to drop. Rows have a fixed height so the target index is arithmetic. Horizontal swipes
 * inside rows (SwipeRow) keep working: the drag only starts after the long press.
 */
export function DraggableList<T>({ data, keyOf, rowHeight, render, onReorder, style, gap = 0, horizontal = false }: {
  /** lay rows out in a row; `rowHeight` is then the row width */
  horizontal?: boolean;
  data: T[];
  keyOf: (item: T, i: number) => string;
  rowHeight: number;
  /** `dragging` = this row is lifted; `lift` must be attached to the row's long-press (e.g. a handle or the row) */
  render: (item: T, i: number, dragging: boolean, lift: () => void) => React.ReactNode;
  onReorder: (from: number, to: number) => void;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const dyValue = useRef(0);
  const [target, setTarget] = useState<number | null>(null);
  const stride = rowHeight + gap;
  const n = data.length;

  const lift = (i: number) => () => {
    activeRef.current = i;
    dyValue.current = 0;
    dy.setValue(0);
    setActive(i);
    setTarget(i);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };
  const drop = () => {
    const from = activeRef.current;
    if (from !== null) {
      const to = Math.max(0, Math.min(n - 1, from + Math.round(dyValue.current / stride)));
      if (to !== from) { onReorder(from, to); Haptics.selectionAsync().catch(() => {}); }
    }
    activeRef.current = null;
    setActive(null);
    setTarget(null);
    dy.setValue(0);
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => activeRef.current !== null,
      onMoveShouldSetPanResponder: () => activeRef.current !== null,
      onMoveShouldSetPanResponderCapture: () => activeRef.current !== null,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (activeRef.current === null) return;
        const d = horizontal ? g.dx : g.dy;
        dyValue.current = d;
        dy.setValue(d);
        const from = activeRef.current;
        const to = Math.max(0, Math.min(n - 1, from + Math.round(d / stride)));
        setTarget((t) => (t === to ? t : to));
      },
      onPanResponderRelease: drop,
      onPanResponderTerminate: drop,
    }),
  ).current;

  return (
    <View style={[horizontal && { flexDirection: 'row' }, style]} {...pan.panHandlers}>
      {data.map((item, i) => {
        const dragging = active === i;
        const shift = active !== null && target !== null && !dragging
          ? (i > active && i <= target ? -stride : i < active && i >= target ? stride : 0)
          : 0;
        return (
          <Animated.View
            key={keyOf(item, i)}
            style={[
              horizontal ? { width: rowHeight, marginEnd: i < n - 1 ? gap : 0 } : { height: rowHeight, marginBottom: i < n - 1 ? gap : 0 },
              dragging && { transform: [horizontal ? { translateX: dy } : { translateY: dy }], zIndex: 10, elevation: 10 },
              !dragging && shift !== 0 && { transform: [horizontal ? { translateX: shift } : { translateY: shift }] },
              dragging && styles.lifted,
            ]}
          >
            {render(item, i, dragging, lift(i))}
          </Animated.View>
        );
      })}
    </View>
  );
}

/** A grip handle to put at the end of a row: long-press it to lift the row. */
export function DragHandle({ onLift, dragging }: { onLift: () => void; dragging?: boolean }) {
  return (
    <Pressable onLongPress={onLift} delayLongPress={180} hitSlop={10} style={[styles.handle, dragging && { backgroundColor: colors.accentSoft }]} accessibilityLabel="Reorder">
      <View style={styles.grip} /><View style={styles.grip} /><View style={styles.grip} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lifted: { backgroundColor: colors.surfaceAlt, borderRadius: radius.m, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  handle: { width: 36, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 3 },
  grip: { width: 16, height: 2, borderRadius: 1, backgroundColor: colors.muted },
});
