import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Exercise } from '../db/schema';
import type { Dosage } from '../db/vocab';
import type { FigureClip } from '../figure/prepare';
import { DrillPager } from './DrillPager';
import { DrillStage } from './DrillStage';
import { colors, radius, shadow, tint } from './theme';

export type ViewerAction = { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; destructive?: boolean };

/** One drill of a workout as laid out before it starts. */
export type ViewerEntry = { blockId: string; slotId: string; sectionName: string; exercise: Exercise; dosage: Dosage; locked?: boolean };

/**
 * Walk through the drills of a workout before starting it: one drill large and looping,
 * ◀ ▶ or swipe to move to the next/previous drill *of this workout*, actions underneath.
 */
export function WorkoutViewer({ visible, entries, index, onIndex, onClose, clipOf, actions }: {
  visible: boolean;
  entries: ViewerEntry[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  clipOf: (e: Exercise) => FigureClip | null;
  actions: (entry: ViewerEntry) => ViewerAction[];
}) {
  const entry = entries[index];
  const go = (dir: 1 | -1) => {
    const i = index + dir;
    if (i < 0 || i >= entries.length) return;
    Haptics.selectionAsync().catch(() => {});
    onIndex(i);
  };
  const dose = (d: Dosage) => (d.type === 'reps' ? `${d.value} reps` : `${d.value} s`) + (d.perSide ? ' / side' : '');
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>{entry ? `${entry.sectionName} · ${index + 1} / ${entries.length}` : ''}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.headBtn}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
        </View>
        {entry && (
          <DrillPager
            items={entries}
            index={index}
            onIndex={onIndex}
            keyOf={(en) => `${en.blockId}/${en.slotId}`}
            render={(en, i, active) => (
              <DrillStage
                e={en.exercise}
                clip={clipOf(en.exercise)}
                caption={`${dose(en.dosage)}${en.locked ? ' · 🔒 locked' : ''}`}
                canBack={i > 0}
                canNext={i < entries.length - 1}
                onBack={() => go(-1)}
                onNext={() => go(1)}
                active={active}
              >
                <View style={styles.actions}>
                  {actions(en).map((a) => (
                    <Pressable key={a.label} onPress={() => { Haptics.selectionAsync().catch(() => {}); a.onPress(); }} style={[styles.action, a.destructive && { backgroundColor: tint(colors.danger, 0.12) }]}>
                      <Ionicons name={a.icon} size={20} color={a.destructive ? colors.danger : colors.ink} />
                      <Text style={[styles.actionText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.small}>swipe or ◀ ▶ for the next drill of this workout</Text>
              </DrillStage>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 10, minHeight: 36 },
  headBtn: { padding: 4 },
  title: { flex: 1, fontWeight: '800', fontSize: 16, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.m, backgroundColor: colors.surface, ...shadow.card },
  actionText: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  small: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 6 },
});
