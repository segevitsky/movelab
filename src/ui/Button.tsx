import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export function Button({ title, onPress, secondary, disabled, danger }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.btn, secondary && styles.btnSecondary, danger && styles.btnDanger, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.btnText, secondary && { color: '#111' }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: '#111', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnSecondary: { backgroundColor: '#e8e8e8' },
  btnDanger: { backgroundColor: '#b3261e' },
  btnText: { color: '#fff', fontWeight: '600' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#ebebeb' },
  chipOn: { backgroundColor: '#d85a30' },
  chipText: { fontSize: 12, color: '#333' },
});
