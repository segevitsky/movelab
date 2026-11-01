import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reportSummary, workoutReport, type ReportDrill } from '../similarity';
import { Sheet } from './primitives';
import { colors, hit, radius, space, type } from './theme';

/**
 * Phase 12 — the advisory strip: one line (first warning, else first note, else "Looks balanced");
 * tap for the full list. Never blocks anything.
 */
export function GuidanceStrip({ drills, style }: { drills: ReportDrill[]; style?: object }) {
  const findings = useMemo(() => workoutReport(drills), [drills]);
  const sum = reportSummary(findings);
  const [open, setOpen] = useState(false);
  if (drills.length === 0) return null;
  const color = sum.level === 'warn' ? colors.danger : sum.level === 'info' ? colors.inkSoft : colors.success;
  const icon = sum.level === 'warn' ? 'alert-circle' : sum.level === 'info' ? 'information-circle' : 'checkmark-circle';
  return (
    <>
      <Pressable onPress={() => findings.length && setOpen(true)} style={({ pressed }) => [styles.strip, pressed && { opacity: 0.8 }, style]}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[styles.text, { color }]} numberOfLines={2}>{sum.text}</Text>
        {findings.length > 1 ? <Text style={styles.count}>+{findings.length - 1}</Text> : null}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Guidance">
        {findings.map((f, i) => (
          <View key={`${f.code}-${i}`} style={styles.row}>
            <Ionicons name={f.level === 'warn' ? 'alert-circle' : 'information-circle'} size={18} color={f.level === 'warn' ? colors.danger : colors.inkSoft} />
            <Text style={styles.rowText}>{f.text}</Text>
          </View>
        ))}
        <Text style={styles.note}>Advice only — your call. Alike = the skeletons move the same way (Phase 12).</Text>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit.min, paddingHorizontal: space.m, borderRadius: radius.m, backgroundColor: colors.surface },
  text: { ...type.body, fontSize: 14, flex: 1 },
  count: { ...type.caption, color: colors.muted, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s, paddingVertical: space.s },
  rowText: { ...type.body, color: colors.ink, flex: 1 },
  note: { ...type.caption, color: colors.muted, marginTop: space.s },
});
