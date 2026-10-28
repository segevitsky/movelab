import React, { useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

export type SwipeAction = { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; onPress: () => void };

const ACTION_W = 74;

/** Row with actions revealed by swiping left (iOS Mail style). Pure JS: Animated + PanResponder. */
export function SwipeRow({ children, actions, disabled }: { children: React.ReactNode; actions: SwipeAction[]; disabled?: boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const width = actions.length * ACTION_W;
  const snap = (to: number) => { open.current = to !== 0; Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 18 }).start(); };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = open.current ? -width : 0;
        const v = Math.max(-width - 20, Math.min(20, base + g.dx));
        x.setValue(v);
      },
      onPanResponderRelease: (_, g) => {
        const base = open.current ? -width : 0;
        const v = base + g.dx;
        if (v < -width / 2 || g.vx < -0.5) snap(-width);
        else snap(0);
      },
      onPanResponderTerminate: () => snap(open.current ? -width : 0),
    }),
  ).current;
  if (disabled || actions.length === 0) return <>{children}</>;
  return (
    <View style={styles.wrap}>
      <View style={[styles.actions, { width }]}>
        {actions.map((a) => (
          <Pressable key={a.label} onPress={() => { snap(0); a.onPress(); }} style={[styles.action, { backgroundColor: a.color }]}>
            <Ionicons name={a.icon} size={18} color="#fff" />
            <Text style={styles.actionText}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      <Animated.View style={{ transform: [{ translateX: x }], backgroundColor: colors.surface }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', borderRadius: 10 },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  action: { width: ACTION_W, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
