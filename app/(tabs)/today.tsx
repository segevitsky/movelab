import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { clipFromExercise } from '../../src/db/repo';
import { deleteWorkout, loadGenContext, saveWorkout } from '../../src/db/workoutRepo';
import type { Workout } from '../../src/db/schema';
import type { WorkoutInputs } from '../../src/db/types';
import { SLOTS, type Slot } from '../../src/db/vocab';
import { generate, swap, slotKey, itemSeconds, type GenContext, type GenWorkout } from '../../src/generator';
import { FigureStill } from '../../src/figure';
import type { Exercise } from '../../src/db/schema';
import type { FrameworkSlot } from '../../src/db/types';
import { Button, Chip, Tag } from '../../src/ui/Button';
import { SwipeRow } from '../../src/ui/SwipeRow';
import { Drop, Pop, Rise } from '../../src/ui/motion';
import { colors, patternColor, radius, shadow, slotColor, tint } from '../../src/ui/theme';


export default function Today() {
  const router = useRouter();
  const { data: frameworks } = useLiveQuery(db.select().from(schema.framework));
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);
  const [fwId, setFwId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<WorkoutInputs>({ energy: 'medium', focus: null, surprise: 0.3 });
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
  const [picker, setPicker] = useState<{ blockId: string; slotId: string; slot: FrameworkSlot } | null>(null);
  const [pickerText, setPickerText] = useState('');
  const chooseFromLibrary = (blockId: string, slotId: string, exerciseId: string) => {
    if (!w || !ctx) return;
    const key = slotKey(blockId, slotId);
    const ex = ctx.library.find((e) => e.id === exerciseId);
    const slot = fw?.blocks.blocks.find((b) => b.id === blockId)?.slots.find((s) => s.id === slotId);
    if (!ex || !slot) return;
    const dosage = slot.dosage ?? ex.dosageDefault ?? { type: 'time' as const, value: 45 };
    const exists = w.items.some((i) => slotKey(i.blockId, i.slotId) === key);
    const rounds = (() => { const b = fw?.blocks.blocks.find((x) => x.id === blockId); return b?.kind === 'rounds' ? b.rounds ?? 1 : 1; })();
    const items = exists
      ? w.items.map((i) => (slotKey(i.blockId, i.slotId) === key ? { ...i, exerciseId, dosage, seconds: itemSeconds(ex, dosage), locked: true } : i))
      : [...w.items, ...Array.from({ length: rounds }, (_, r) => ({ blockId, slotId, round: r + 1, exerciseId, dosage, seconds: itemSeconds(ex, dosage), locked: true }))];
    setW({ ...w, items, unfilled: w.unfilled.filter((u) => !(u.blockId === blockId && u.slotId === slotId)) });
    setPicker(null);
  };
  const adjust = (blockId: string, slotId: string, dir: 1 | -1) => {
    if (!w || !ctx) return;
    const key = slotKey(blockId, slotId);
    const byIdG = new Map(ctx.library.map((e) => [e.id, e]));
    setW({ ...w, items: w.items.map((i) => {
      if (slotKey(i.blockId, i.slotId) !== key) return i;
      const d = i.dosage;
      const value = d.type === 'time' ? Math.max(10, d.value + dir * 15) : Math.max(1, d.value + dir * 2);
      const dosage = { ...d, value };
      return { ...i, dosage, seconds: itemSeconds(byIdG.get(i.exerciseId), dosage) };
    }) });
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
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={[styles.container, w ? { paddingBottom: 130 } : null]} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.panel, shadow.card]}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Framework</Text>
          <Pressable onPress={() => router.push('/frameworks')} hitSlop={8}><Text style={styles.link}>Edit frameworks ›</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(frameworks ?? []).map((f) => <Chip key={f.id} label={f.name} color={colors.accent} on={f.id === fwId} onPress={() => setFwId(f.id)} />)}
        </ScrollView>
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
          <Drop index={0} style={[styles.why, { backgroundColor: tint(colors.accent, 0.1) }]}>
            <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
            <Text style={styles.whyText}>{w.why}</Text>
          </Drop>
          {fw.blocks.blocks.map((b, bi) => {
            const its = w.items.filter((i) => i.blockId === b.id && i.round === 1);
            const rounds = b.kind === 'rounds' ? b.rounds ?? 1 : 1;
            return (
              <Drop key={b.id} index={bi} style={[styles.block, shadow.card]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.blockTitle}>{b.name}</Text>
                  <Text style={styles.small}>{rounds > 1 ? `× ${rounds} rounds` : b.seconds ? `${Math.round(b.seconds / 60)} min` : ''}</Text>
                </View>
                {rounds > 1 && (
                  <View style={styles.chips}>
                    <Text style={[styles.small, { alignSelf: 'center' }]}>break between rounds</Text>
                    {[60, 90, 120, 180].map((r) => <Chip key={r} label={`${r} s`} color={colors.inkSoft} on={(w.inputs.restBetweenRoundsSec ?? b.restBetweenRoundsSec ?? 0) === r} onPress={() => setW({ ...w, inputs: { ...w.inputs, restBetweenRoundsSec: r } })} />)}
                  </View>
                )}
                {b.slots.map((s) => {
                  const it = its.find((i) => i.slotId === s.id);
                  const ex = it ? byId.get(it.exerciseId) : undefined;
                  const clip = ex ? clipFromExercise(ex) : null;
                  const actions = () => {
                    if (!ex || !it) return;
                    Alert.alert(ex.name, undefined, [
                      { text: 'Choose from library…', onPress: () => { setPickerText(''); setPicker({ blockId: b.id, slotId: s.id, slot: s }); } },
                      { text: 'Surprise me (random swap)', onPress: () => doSwap(b.id, s.id) },
                      { text: it.locked ? 'Unlock (may change next time)' : 'Lock (keep on regenerate)', onPress: () => toggleLock(b.id, s.id) },
                      { text: 'Open card', onPress: () => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } }) },
                      { text: 'Remove from this workout', style: 'destructive', onPress: () => removeItem(b.id, s.id) },
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  };
                  return (
                    <Rise key={`${s.id}-${it?.exerciseId ?? 'none'}`} index={0}>
                    <SwipeRow
                      disabled={!ex}
                      actions={[
                        { label: 'Choose', icon: 'albums-outline', color: colors.accent, onPress: () => { setPickerText(''); setPicker({ blockId: b.id, slotId: s.id, slot: s }); } },
                        { label: 'Remove', icon: 'trash-outline', color: colors.danger, onPress: () => removeItem(b.id, s.id) },
                      ]}
                    >
                    <Pressable style={styles.item} onPress={ex ? actions : () => { setPickerText(''); setPicker({ blockId: b.id, slotId: s.id, slot: s }); }}>
                      <View style={styles.thumb}>{clip ? <FigureStill clip={clip} width={64} height={78} /> : <Ionicons name={ex ? 'body-outline' : 'help-outline'} size={22} color={colors.muted} />}</View>
                      <View style={{ flex: 1, gap: 3 }}>
                        {ex ? (
                          <>
                            <Text style={styles.itemName} numberOfLines={1}>{it!.locked ? '🔒 ' : ''}{ex.name}</Text>
                            <View style={styles.tagRow}>
                              {ex.pattern && <Tag label={ex.pattern} color={patternColor[ex.pattern]} />}
                              <Pressable onPress={() => adjust(b.id, s.id, -1)} hitSlop={8} style={styles.stepBtn}><Text style={styles.stepBtnText}>−</Text></Pressable>
                              <Text style={styles.dose}>{it!.dosage.type === 'reps' ? `${it!.dosage.value} reps` : `${it!.dosage.value} s`}{it!.dosage.perSide ? ' / side' : ''}</Text>
                              <Pressable onPress={() => adjust(b.id, s.id, 1)} hitSlop={8} style={styles.stepBtn}><Text style={styles.stepBtnText}>+</Text></Pressable>
                              <Text style={styles.small}>≈{it!.seconds} s</Text>
                            </View>
                          </>
                        ) : (
                          <Text style={styles.missing}>no card for {s.tags.join(' / ')} yet{s.optional ? ' (optional)' : ''} · tap to choose one</Text>
                        )}
                      </View>
                      {ex && <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />}
                    </Pressable>
                    </SwipeRow>
                    </Rise>
                  );
                })}
              </Drop>
            );
          })}
          <View style={styles.rowBetween}>
            <Text style={styles.small}>≈ {Math.round(w.totalSeconds / 60)} min total · tap a row for options, swipe left for quick actions</Text>
          </View>
          <Pressable onPress={() => save(false)} style={{ alignSelf: 'center', paddingVertical: 6 }}><Text style={styles.link}>Save for later without starting</Text></Pressable>
        </View>
      )}
      {!w && (exercises?.length ?? 0) === 0 && <Text style={styles.small}>Your library is empty — capture a few reels first.</Text>}
      <Modal visible={!!picker} animationType="slide" onRequestClose={() => setPicker(null)}>
        {picker && (
          <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 56 }}>
            <View style={[styles.rowBetween, { paddingHorizontal: 16 }]}>
              <Text style={styles.blockTitle}>Choose a drill · {picker.slot.tags.join(' / ')}</Text>
              <Pressable onPress={() => setPicker(null)} hitSlop={8}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
            </View>
            <TextInput style={styles.search} placeholder="Search" placeholderTextColor={colors.muted} value={pickerText} onChangeText={setPickerText} autoCorrect={false} />
            <FlatList
              data={(() => {
                const all = (exercises ?? []).filter((e: Exercise) => !e.archived && (!pickerText || e.name.toLowerCase().includes(pickerText.toLowerCase())));
                const fits = all.filter((e: Exercise) => picker.slot.tags.some((t) => e.slots.includes(t)));
                const rest = all.filter((e: Exercise) => !fits.includes(e));
                return [...fits.map((e: Exercise) => ({ e, fits: true })), ...rest.map((e: Exercise) => ({ e, fits: false }))];
              })()}
              keyExtractor={(r) => r.e.id}
              contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 60 }}
              renderItem={({ item: r }) => {
                const clip = clipFromExercise(r.e);
                return (
                  <Pressable onPress={() => chooseFromLibrary(picker.blockId, picker.slotId, r.e.id)} style={[styles.item, styles.pickRow, !r.fits && { opacity: 0.75 }]}>
                    <View style={styles.thumb}>{clip ? <FigureStill clip={clip} width={64} height={78} /> : <Ionicons name="body-outline" size={22} color={colors.muted} />}</View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.itemName}>{r.e.name}</Text>
                      <View style={styles.tagRow}>
                        {r.e.pattern && <Tag label={r.e.pattern} color={patternColor[r.e.pattern]} />}
                        {r.e.slots.slice(0, 3).map((t) => <Tag key={t} label={t} color={slotColor[t] ?? colors.muted} />)}
                        {!r.fits && <Text style={styles.small}>· not tagged for this slot</Text>}
                      </View>
                    </View>
                    <Ionicons name="add-circle" size={24} color={colors.accent} />
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={[styles.small, { padding: 16 }]}>No exercises yet.</Text>}
            />
          </View>
        )}
      </Modal>
      {recentList.length > 0 && (
        <View style={[styles.panel, shadow.card]}>
          <Text style={styles.label}>Recent workouts</Text>
          {recentList.map((r: Workout) => (
            <SwipeRow key={r.id} actions={[{ label: 'Delete', icon: 'trash-outline', color: colors.danger, onPress: () => Alert.alert('Delete this workout?', 'It leaves your history too.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(db, r.id) }]) }]}>
              <Pressable
                style={styles.recentRow}
                onPress={() => router.push({ pathname: '/workout/[id]', params: { id: r.id } })}
                onLongPress={() => Alert.alert('Delete this workout?', 'It leaves your history too.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(db, r.id) }])}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{new Date(r.createdAt).toLocaleDateString()} · {frameworks?.find((f) => f.id === r.frameworkId)?.name ?? 'workout'}</Text>
                  <Text style={styles.small} numberOfLines={1}>{r.why ?? `${r.items.length} items`}</Text>
                </View>
                <Pressable onPress={() => router.push({ pathname: '/player/[workoutId]', params: { workoutId: r.id } })} hitSlop={8}><Ionicons name="play-circle" size={30} color={colors.accent} /></Pressable>
              </Pressable>
            </SwipeRow>
          ))}
          <Text style={styles.small}>tap to view and edit · ▶ to start · swipe left or long-press to delete</Text>
        </View>
      )}
    </ScrollView>
    {w && (
      <Pop style={styles.fabWrap}>
        <Pressable onPress={() => save(true)} style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.92 }], opacity: 0.9 }]}>
          <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
        </Pressable>
      </Pop>
    )}
    </View>
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
  stepBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontWeight: '800', color: colors.ink, fontSize: 16, lineHeight: 18 },
  dose: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  pickRow: { backgroundColor: colors.surface, borderRadius: radius.m, padding: 8 },
  search: { margin: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: 10, backgroundColor: colors.surface, color: colors.ink },
  fabWrap: { position: 'absolute', right: 18, bottom: 18 },
  fab: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...shadow.card, shadowOpacity: 0.25 },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
});
