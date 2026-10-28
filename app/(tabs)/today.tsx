import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { clipFromExercise } from '../../src/db/repo';
import { loadGenContext, recentWorkouts, saveWorkout } from '../../src/db/workoutRepo';
import type { Workout } from '../../src/db/schema';
import type { WorkoutInputs } from '../../src/db/types';
import { SLOTS, type Slot } from '../../src/db/vocab';
import { generate, swap, slotKey, type GenContext, type GenWorkout } from '../../src/generator';
import { FigureStill } from '../../src/figure';
import { Button, Chip, Tag } from '../../src/ui/Button';
import { colors, patternColor, radius, shadow, slotColor, tint } from '../../src/ui/theme';

const TIMES = [20, 30, 45, 60];

export default function Today() {
  const router = useRouter();
  const { data: frameworks } = useLiveQuery(db.select().from(schema.framework));
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);
  const [fwId, setFwId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<WorkoutInputs>({ timeAvailableMin: 30, energy: 'medium', focus: null, surprise: 0.3 });
  const [ctx, setCtx] = useState<GenContext | null>(null);
  const [w, setW] = useState<GenWorkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const { data: recent } = useLiveQuery(db.select().from(schema.workout));
  const recentList = useMemo(() => (recent ?? []).slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5), [recent]);
  useEffect(() => { if (!fwId && frameworks?.length) setFwId(frameworks.find((f) => f.id === 'preset-segev-3x6')?.id ?? frameworks[0].id); }, [frameworks]);

  const run = async (seed = Date.now() % 1e9) => {
    if (!fwId) return;
    setBusy(true);
    try {
      const c = await loadGenContext(db, fwId, inputs, seed);
      setCtx(c);
      setRemoved([]);
      setW(generate(c));
    } catch (e) {
      Alert.alert('Could not generate', String(e));
    } finally {
      setBusy(false);
    }
  };
  const doSwap = (blockId: string, slotId: string) => { if (ctx && w) setW(swap({ ...ctx, excluded: removed }, w, blockId, slotId)); };
  const toggleLock = (blockId: string, slotId: string) => {
    if (!w) return;
    const key = slotKey(blockId, slotId);
    setW({ ...w, items: w.items.map((i) => (slotKey(i.blockId, i.slotId) === key ? { ...i, locked: !i.locked } : i)) });
  };
  const removeItem = (blockId: string, slotId: string) => {
    if (!ctx || !w) return;
    const key = slotKey(blockId, slotId);
    const ex = w.items.find((i) => slotKey(i.blockId, i.slotId) === key)?.exerciseId;
    const excluded = ex ? [...removed, ex] : removed;
    setRemoved(excluded);
    const locked: Record<string, string> = {};
    for (const it of w.items) if (slotKey(it.blockId, it.slotId) !== key) locked[slotKey(it.blockId, it.slotId)] = it.exerciseId;
    setW(generate({ ...ctx, locked, excluded }));
  };
  const save = async (start: boolean) => {
    if (!w) return;
    const id = await saveWorkout(db, w);
    if (start) router.push({ pathname: '/player/[workoutId]', params: { workoutId: id } });
    else Alert.alert('Saved', 'It counts as history now. Start it from the list below any time.');
  };

  const fw = frameworks?.find((f) => f.id === fwId);
  return (
    <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.panel, shadow.card]}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Framework</Text>
          <Pressable onPress={() => router.push('/frameworks')} hitSlop={8}><Text style={styles.link}>Edit frameworks ›</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(frameworks ?? []).map((f) => <Chip key={f.id} label={f.name} color={colors.accent} on={f.id === fwId} onPress={() => setFwId(f.id)} />)}
        </ScrollView>
        <Text style={styles.label}>Time</Text>
        <View style={styles.chips}>{TIMES.map((t) => <Chip key={t} label={`${t} min`} color={colors.inkSoft} on={inputs.timeAvailableMin === t} onPress={() => setInputs({ ...inputs, timeAvailableMin: t })} />)}</View>
        <Text style={styles.label}>Energy</Text>
        <View style={styles.chips}>{(['low', 'medium', 'high'] as const).map((e) => <Chip key={e} label={e} color={colors.inkSoft} on={inputs.energy === e} onPress={() => setInputs({ ...inputs, energy: e })} />)}</View>
        <Text style={styles.label}>Focus (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SLOTS.map((s) => <Chip key={s} label={s} color={slotColor[s] ?? colors.inkSoft} on={inputs.focus === s} onPress={() => setInputs({ ...inputs, focus: inputs.focus === s ? null : (s as Slot) })} />)}
        </ScrollView>
        <Text style={styles.label}>Surprise</Text>
        <View style={styles.chips}>{[[0, 'safe'], [0.3, 'mix'], [0.8, 'surprise me']].map(([v, l]) => <Chip key={String(v)} label={String(l)} color={colors.inkSoft} on={inputs.surprise === v} onPress={() => setInputs({ ...inputs, surprise: Number(v) })} />)}</View>
        <Button title={busy ? 'Generating…' : w ? 'Generate again' : "Today's workout"} onPress={() => run()} disabled={busy || !fwId} />
      </View>

      {w && fw && (
        <View style={{ gap: 12 }}>
          <View style={[styles.why, { backgroundColor: tint(colors.accent, 0.1) }]}>
            <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
            <Text style={styles.whyText}>{w.why}</Text>
          </View>
          {fw.blocks.blocks.map((b) => {
            const its = w.items.filter((i) => i.blockId === b.id && i.round === 1);
            const rounds = b.kind === 'rounds' ? b.rounds ?? 1 : 1;
            return (
              <View key={b.id} style={[styles.block, shadow.card]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.blockTitle}>{b.name}</Text>
                  <Text style={styles.small}>{rounds > 1 ? `× ${rounds} rounds · rest ${b.restBetweenRoundsSec ?? 0} s` : b.seconds ? `${Math.round(b.seconds / 60)} min` : ''}</Text>
                </View>
                {b.slots.map((s) => {
                  const it = its.find((i) => i.slotId === s.id);
                  const ex = it ? byId.get(it.exerciseId) : undefined;
                  const clip = ex ? clipFromExercise(ex) : null;
                  const actions = () => {
                    if (!ex || !it) return;
                    Alert.alert(ex.name, undefined, [
                      { text: 'Swap for another', onPress: () => doSwap(b.id, s.id) },
                      { text: it.locked ? 'Unlock (may change next time)' : 'Lock (keep on regenerate)', onPress: () => toggleLock(b.id, s.id) },
                      { text: 'Open card', onPress: () => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } }) },
                      { text: 'Remove from this workout', style: 'destructive', onPress: () => removeItem(b.id, s.id) },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  };
                  return (
                    <Pressable key={s.id} style={styles.item} onPress={actions} disabled={!ex}>
                      <View style={styles.thumb}>{clip ? <FigureStill clip={clip} width={64} height={78} /> : <Ionicons name={ex ? 'body-outline' : 'help-outline'} size={22} color={colors.muted} />}</View>
                      <View style={{ flex: 1, gap: 3 }}>
                        {ex ? (
                          <>
                            <Text style={styles.itemName} numberOfLines={1}>{it!.locked ? '🔒 ' : ''}{ex.name}</Text>
                            <View style={styles.tagRow}>
                              {ex.pattern && <Tag label={ex.pattern} color={patternColor[ex.pattern]} />}
                              <Text style={styles.small}>{it!.dosage.type === 'reps' ? `${it!.dosage.value} reps` : `${it!.dosage.value} s`}{it!.dosage.perSide ? ' / side' : ''} · ≈{it!.seconds} s</Text>
                            </View>
                          </>
                        ) : (
                          <Text style={styles.missing}>no card for {s.tags.join(' / ')} yet{s.optional ? ' (optional)' : ''}</Text>
                        )}
                      </View>
                      {ex && <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
          <View style={styles.rowBetween}>
            <Text style={styles.small}>≈ {Math.round(w.totalSeconds / 60)} min total · tap a row to swap, lock or remove it</Text>
          </View>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}><Button title="Save for later" onPress={() => save(false)} secondary /></View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 2 }}><Button title="▶ Start workout" onPress={() => save(true)} /></View>
          </View>
        </View>
      )}
      {!w && (exercises?.length ?? 0) === 0 && <Text style={styles.small}>Your library is empty — capture a few reels first.</Text>}
      {recentList.length > 0 && (
        <View style={[styles.panel, shadow.card]}>
          <Text style={styles.label}>Recent workouts</Text>
          {recentList.map((r: Workout) => (
            <Pressable key={r.id} style={styles.recentRow} onPress={() => router.push({ pathname: '/player/[workoutId]', params: { workoutId: r.id } })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{new Date(r.createdAt).toLocaleDateString()} · {frameworks?.find((f) => f.id === r.frameworkId)?.name ?? 'workout'}</Text>
                <Text style={styles.small} numberOfLines={1}>{r.why ?? `${r.items.length} items`}</Text>
              </View>
              <Ionicons name="play-circle" size={28} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 80, backgroundColor: colors.bg },
  panel: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 14, gap: 8 },
  label: { fontWeight: '700', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  why: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: radius.m },
  whyText: { flex: 1, color: colors.ink, fontSize: 13 },
  block: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 12, gap: 8 },
  blockTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 64, height: 78, borderRadius: radius.s, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontWeight: '700', color: colors.ink },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  missing: { color: colors.muted, fontStyle: 'italic', fontSize: 13 },
  small: { fontSize: 12, color: colors.muted },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
});
