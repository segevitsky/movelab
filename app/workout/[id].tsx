import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { clipFromExercise } from '../../src/db/repo';
import { deleteWorkout, updateWorkoutItems } from '../../src/db/workoutRepo';
import type { Exercise } from '../../src/db/schema';
import type { FrameworkSlot, WorkoutItem } from '../../src/db/types';
import { itemSeconds } from '../../src/generator';
import { toGenExercise } from '../../src/db/workoutRepo';
import { FigureStill } from '../../src/figure';
import { Button, Chip, Tag } from '../../src/ui/Button';
import { ExercisePicker } from '../../src/ui/ExercisePicker';
import { SwipeRow } from '../../src/ui/SwipeRow';
import { colors, patternColor, radius, shadow, slotColor } from '../../src/ui/theme';

/** Workout preview: see every drill, change any of them, adjust dosage and breaks, then start. */
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: rows } = useLiveQuery(db.select().from(schema.workout).where(eq(schema.workout.id, id)), [id]);
  const w = rows?.[0];
  const { data: fws } = useLiveQuery(db.select().from(schema.framework));
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const fw = fws?.find((f) => f.id === w?.frameworkId);
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);
  const [picker, setPicker] = useState<{ blockId: string; slotId: string; slot: FrameworkSlot } | null>(null);
  if (!w || !fw) return <View style={{ padding: 24 }}><Text style={styles.small}>Loading…</Text></View>;

  const save = (items: WorkoutItem[], inputs = w.inputs) => updateWorkoutItems(db, w.id, items, inputs).catch((e) => Alert.alert('Save failed', String(e)));
  const key = (b: string, s: string) => `${b}/${s}`;
  const replace = (blockId: string, slotId: string, ex: Exercise) => {
    const slot = fw.blocks.blocks.find((b) => b.id === blockId)?.slots.find((s) => s.id === slotId);
    const dosage = slot?.dosage ?? ex.dosageDefault ?? { type: 'time' as const, value: 45 };
    const exists = w.items.some((i) => key(i.blockId, i.slotId) === key(blockId, slotId));
    const block = fw.blocks.blocks.find((b) => b.id === blockId)!;
    const rounds = block.kind === 'rounds' ? block.rounds ?? 1 : 1;
    const items = exists
      ? w.items.map((i) => (key(i.blockId, i.slotId) === key(blockId, slotId) ? { ...i, exerciseId: ex.id, dosage, locked: true } : i))
      : [...w.items, ...Array.from({ length: rounds }, (_, r) => ({ blockId, slotId, round: r + 1, exerciseId: ex.id, dosage, locked: true }))];
    save(items);
    setPicker(null);
  };
  const remove = (blockId: string, slotId: string) => save(w.items.filter((i) => key(i.blockId, i.slotId) !== key(blockId, slotId)));
  const adjust = (blockId: string, slotId: string, dir: 1 | -1) =>
    save(w.items.map((i) => {
      if (key(i.blockId, i.slotId) !== key(blockId, slotId)) return i;
      const value = i.dosage.type === 'time' ? Math.max(10, i.dosage.value + dir * 15) : Math.max(1, i.dosage.value + dir * 2);
      return { ...i, dosage: { ...i.dosage, value } };
    }));
  const total = w.items.reduce((s, i) => { const ex = byId.get(i.exerciseId); return s + itemSeconds(ex ? toGenExercise(ex) : undefined, i.dosage); }, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.h1}>{fw.name}</Text>
        <Text style={styles.small}>{new Date(w.createdAt).toLocaleString()} · ≈ {Math.round(total / 60)} min of work{w.why ? `\n${w.why}` : ''}</Text>
        {fw.blocks.blocks.map((b) => {
          const rounds = b.kind === 'rounds' ? b.rounds ?? 1 : 1;
          return (
            <View key={b.id} style={[styles.block, shadow.card]}>
              <View style={styles.rowBetween}>
                <Text style={styles.blockTitle}>{b.name}</Text>
                <Text style={styles.small}>{rounds > 1 ? `× ${rounds} rounds` : ''}</Text>
              </View>
              {rounds > 1 && (
                <View style={styles.chips}>
                  <Text style={[styles.small, { alignSelf: 'center' }]}>break between rounds</Text>
                  {[60, 90, 120, 180].map((r) => <Chip key={r} label={`${r} s`} color={colors.inkSoft} on={(w.inputs.restBetweenRoundsSec ?? b.restBetweenRoundsSec ?? 0) === r} onPress={() => save(w.items, { ...w.inputs, restBetweenRoundsSec: r })} />)}
                </View>
              )}
              {b.slots.map((s) => {
                const it = w.items.find((i) => i.blockId === b.id && i.slotId === s.id && i.round === 1);
                const ex = it ? byId.get(it.exerciseId) : undefined;
                const clip = ex ? clipFromExercise(ex) : null;
                const open = () => setPicker({ blockId: b.id, slotId: s.id, slot: s });
                return (
                  <SwipeRow key={s.id} disabled={!ex} actions={[{ label: 'Change', icon: 'albums-outline', color: colors.accent, onPress: open }, { label: 'Remove', icon: 'trash-outline', color: colors.danger, onPress: () => remove(b.id, s.id) }]}>
                    <Pressable style={styles.item} onPress={ex ? () => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } }) : open} onLongPress={open}>
                      <View style={styles.thumb}>{clip ? <FigureStill clip={clip} width={64} height={78} /> : <Ionicons name={ex ? 'body-outline' : 'add-circle-outline'} size={24} color={colors.muted} />}</View>
                      <View style={{ flex: 1, gap: 3 }}>
                        {ex ? (
                          <>
                            <Text style={styles.itemName} numberOfLines={1}>{ex.name}</Text>
                            <View style={styles.tagRow}>
                              {ex.pattern && <Tag label={ex.pattern} color={patternColor[ex.pattern]} />}
                              <Pressable onPress={() => adjust(b.id, s.id, -1)} hitSlop={8} style={styles.stepBtn}><Text style={styles.stepBtnText}>−</Text></Pressable>
                              <Text style={styles.dose}>{it!.dosage.type === 'reps' ? `${it!.dosage.value} reps` : `${it!.dosage.value} s`}</Text>
                              <Pressable onPress={() => adjust(b.id, s.id, 1)} hitSlop={8} style={styles.stepBtn}><Text style={styles.stepBtnText}>+</Text></Pressable>
                            </View>
                          </>
                        ) : (
                          <Text style={styles.missing}>empty slot ({s.tags.join(' / ')}) · tap to choose</Text>
                        )}
                      </View>
                      {ex && <Pressable onPress={open} hitSlop={8}><Ionicons name="swap-horizontal" size={20} color={colors.accent} /></Pressable>}
                    </Pressable>
                  </SwipeRow>
                );
              })}
            </View>
          );
        })}
        <Button title="Delete this workout" onPress={() => Alert.alert('Delete workout?', undefined, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(db, w.id).then(() => router.back()) }])} secondary />
      </ScrollView>
      <Pressable onPress={() => router.push({ pathname: '/player/[workoutId]', params: { workoutId: w.id } })} style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.92 }] }]}>
        <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
      </Pressable>
      {picker && <ExercisePicker visible title={`Choose for ${picker.slot.tags.join(' / ')}`} exercises={exercises ?? []} preferTags={picker.slot.tags} onPick={(e) => replace(picker.blockId, picker.slotId, e)} onClose={() => setPicker(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 120 },
  h1: { fontSize: 20, fontWeight: '800', color: colors.ink },
  block: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 12, gap: 8 },
  blockTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, paddingVertical: 4 },
  thumb: { width: 64, height: 78, borderRadius: radius.s, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontWeight: '700', color: colors.ink },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontWeight: '800', color: colors.ink, fontSize: 16, lineHeight: 18 },
  dose: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  missing: { color: colors.muted, fontStyle: 'italic', fontSize: 13 },
  small: { fontSize: 12, color: colors.muted },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...shadow.card, shadowOpacity: 0.25 },
});
