import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

export type SwipeAction = { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; onPress: () => void };

/** Row with actions revealed by swiping left (iOS Mail style). */
export function SwipeRow({ children, actions, disabled }: { children: React.ReactNode; actions: SwipeAction[]; disabled?: boolean }) {
  const ref = useRef<SwipeableMethods>(null);
  if (disabled || actions.length === 0) return <>{children}</>;
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      rightThreshold={36}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable key={a.label} onPress={() => { ref.current?.close(); a.onPress(); }} style={[styles.action, { backgroundColor: a.color }]}>
              <Ionicons name={a.icon} size={18} color="#fff" />
              <Text style={styles.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  action: { width: 74, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
