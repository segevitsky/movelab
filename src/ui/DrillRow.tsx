import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Exercise } from '../db/schema';
import type { Dosage } from '../db/vocab';
import type { FigureClip } from '../figure/prepare';
import { FigureStill } from '../figure';
import { Tag } from './Button';
import { DirectionalIcon } from './primitives';
import { colors, patternColor, radius, space, type } from './theme';

export const THUMB_W = 56;
export const THUMB_H = 68;

export function doseText(d: Dosage) {
  return (d.type === 'reps' ? `${d.value} reps` : `${d.value} s`) + (d.perSide ? ' / side' : '');
}

/**
 * One drill of a workout as a quiet row: still figure (start), name, one dosage line, one tag, a lock glyph
 * only when locked. Tap = the caller's action (usually the viewer). No inline controls (docs/06 §2c).
 */
export function DrillRow({ ex, clip, dosage, locked, caption, onPress, onLongPress, missingText, trailing }: {
  ex?: Exercise; clip?: FigureClip | null; dosage?: Dosage; locked?: boolean; caption?: string;
  onPress: () => void; onLongPress?: () => void;
  /** shown instead of a drill when the slot is empty */
  missingText?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <View style={styles.thumb}>
        {ex && clip ? <FigureStill clip={clip} width={THUMB_W} height={THUMB_H} /> : <Ionicons name={ex ? 'body-outline' : 'add-circle-outline'} size={22} color={colors.muted} />}
      </View>
      <View style={styles.body}>
        {ex ? (
          <>
            <View style={styles.nameRow}>
              {locked ? <Ionicons name="lock-closed" size={14} color={colors.muted} /> : null}
              <Text style={styles.name} numberOfLines={1}>{ex.name}</Text>
            </View>
            <View style={styles.metaRow}>
              {dosage ? <Text style={styles.dose}>{doseText(dosage)}</Text> : null}
              {caption ? <Text style={styles.caption} numberOfLines={1}>{caption}</Text> : null}
              {ex.pattern ? <Tag label={ex.pattern} color={patternColor[ex.pattern]} /> : null}
            </View>
          </>
        ) : (
          <Text style={styles.missing} numberOfLines={2}>{missingText ?? 'empty slot · tap to choose'}</Text>
        )}
      </View>
      {trailing ?? <DirectionalIcon name="chevron-forward" size={20} color={colors.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s, paddingHorizontal: space.xs, borderRadius: radius.m },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: radius.s, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { ...type.bodyStrong, color: colors.ink, flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexWrap: 'wrap' },
  dose: { ...type.body, fontSize: 14, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  caption: { ...type.caption, color: colors.muted, flexShrink: 1 },
  missing: { ...type.body, fontSize: 14, color: colors.muted, fontStyle: 'italic' },
});
