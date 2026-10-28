import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, tint } from './theme';

export function Button({ title, onPress, secondary, disabled, danger }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.btn, secondary && styles.btnSecondary, danger && styles.btnDanger, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.btnText, secondary && { color: colors.ink }]}>{title}</Text>
    </Pressable>
  );
}

/** Toggle chip; `color` tints it (off = soft tint + coloured text, on = solid). */
export function Chip({ label, on, onPress, color = colors.inkSoft }: { label: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: on ? color : tint(color, 0.12), borderColor: on ? color : tint(color, 0.35) }]}>
      <Text style={[styles.chipText, { color: on ? '#fff' : color }]}>{label}</Text>
    </Pressable>
  );
}

/** Small non-interactive tag pill. */
export function Tag({ label, color = colors.muted }: { label: string; color?: string }) {
  return (
    <Text style={[styles.tag, { backgroundColor: tint(color, 0.14), color }]}>{label}</Text>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: colors.accent, paddingVertical: 13, paddingHorizontal: 16, borderRadius: radius.m, alignItems: 'center' },
  btnSecondary: { backgroundColor: colors.surfaceAlt },
  btnDanger: { backgroundColor: colors.danger },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  tag: { fontSize: 11, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
});
