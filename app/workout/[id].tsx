import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { useClipCache } from '../../src/ui/useClipCache';
import { deleteWorkout, suggestWorkoutTags, updateWorkoutItems, updateWorkoutMeta } from '../../src/db/workoutRepo';
import { WORKOUT_TAGS, type WorkoutTag } from '../../src/db/vocab';
import type { Exercise } from '../../src/db/schema';
import type { FrameworkSlot, WorkoutItem } from '../../src/db/types';
import { itemSeconds } from '../../src/generator';
import { toGenExercise } from '../../src/db/workoutRepo';
import { Button, Chip, ChipRow, IconButton } from '../../src/ui/Button';
import { Divider, OptionRow, Screen, SectionHeader, Sheet } from '../../src/ui/primitives';
import { DrillRow } from '../../src/ui/DrillRow';
import { ExercisePicker } from '../../src/ui/ExercisePicker';
import { WorkoutViewer, type ViewerEntry } from '../../src/ui/WorkoutViewer';
import { SwipeRow } from '../../src/ui/SwipeRow';
import { colors, hit, radius, slotColor, space, type } from '../../src/ui/theme';

const BREAKS = [60, 90, 120, 180];

/** Workout preview: see every drill, step through them, change any of them, adjust dosage and breaks, then start. */
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: rows } = useLiveQuery(db.select().from(schema.workout).where(eq(schema.workout.id, id)), [id]);
  const w = rows?.[0];
  const { data: fws } = useLiveQuery(db.select().from(schema.framework));
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const fw = fws?.find((f) => f.id === w?.frameworkId);
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);
  const clips = useClipCache(exercises);
  const [picker, setPicker] = useState<{ blockId: string; slotId: string; slot: FrameworkSlot; extra?: boolean } | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [breakSheet, setBreakSheet] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => { if (w) { setName(w.name ?? ''); setDesc(w.description ?? ''); } }, [w?.id]);
  if (!w || !fw) return <Screen><Text style={[styles.small, { padding: space.xl }]}>Loading…</Text></Screen>;

  const entries: ViewerEntry[] = [];
  for (const b of fw.blocks.blocks) {
    if (w.inputs.blockOverrides?.[b.id]?.skipped) continue;
    const slotIds = [...b.slots.map((s) => s.id), ...w.items.filter((i) => i.blockId === b.id && !b.slots.some((s) => s.id === i.slotId)).map((i) => i.slotId)];
    for (const sid of [...new Set(slotIds)]) {
      const it = w.items.find((i) => i.blockId === b.id && i.slotId === sid && i.round === 1);
      const ex = it ? byId.get(it.exerciseId) : undefined;
      if (it && ex) entries.push({ blockId: b.id, slotId: sid, sectionName: b.name, exercise: ex, dosage: it.dosage, locked: it.locked });
    }
  }
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
  const meta = (patch: Parameters<typeof updateWorkoutMeta>[2]) => updateWorkoutMeta(db, w.id, patch).catch((e) => Alert.alert('Save failed', String(e)));
  const tags: WorkoutTag[] = w.tags ?? [];
  const suggested = suggestWorkoutTags(w.items, byId).filter((t) => !tags.includes(t));
  const toggleTag = (t: WorkoutTag) => meta({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });
  const ov = (blockId: string) => w.inputs.blockOverrides?.[blockId] ?? {};
  const setOv = (blockId: string, patch: { skipped?: boolean; rounds?: number }) => save(w.items, { ...w.inputs, blockOverrides: { ...(w.inputs.blockOverrides ?? {}), [blockId]: { ...ov(blockId), ...patch } } });
  const addExtra = (blockId: string, ex: Exercise) => {
    const block = fw.blocks.blocks.find((b) => b.id === blockId)!;
    const rounds = block.kind === 'rounds' ? ov(blockId).rounds ?? block.rounds ?? 1 : 1;
    const slotId = `extra-${Date.now().toString(36)}`;
    const dosage = ex.dosageDefault ?? { type: 'time' as const, value: 45 };
    save([...w.items, ...Array.from({ length: rounds }, (_, r) => ({ blockId, slotId, round: r + 1, exerciseId: ex.id, dosage, locked: true }))]);
    setPicker(null);
  };
  const adjust = (blockId: string, slotId: string, dir: 1 | -1) =>
    save(w.items.map((i) => {
      if (key(i.blockId, i.slotId) !== key(blockId, slotId)) return i;
      const value = i.dosage.type === 'time' ? Math.max(10, i.dosage.value + dir * 15) : Math.max(1, i.dosage.value + dir * 2);
      return { ...i, dosage: { ...i.dosage, value } };
    }));
  const total = w.items.reduce((s, i) => { const ex = byId.get(i.exerciseId); return s + itemSeconds(ex ? toGenExercise(ex) : undefined, i.dosage); }, 0);
  const breakOf = (b: { restBetweenRoundsSec?: number }) => w.inputs.restBetweenRoundsSec ?? b.restBetweenRoundsSec ?? 0;
  const confirmDelete = () => Alert.alert('Delete workout?', undefined, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(db, w.id).then(() => router.back()) }]);

  return (
    <Screen scroll contentStyle={{ gap: space.m }} footer={<Button title={`Start · ${Math.round(total / 60)} min`} size="l" icon="play" onPress={() => router.push({ pathname: '/player/[workoutId]', params: { workoutId: w.id } })} />}>
      <TextInput
        style={styles.h1Input}
        value={name}
        onChangeText={setName}
        placeholder={fw.name}
        placeholderTextColor={colors.muted}
        onBlur={() => (name.trim() || null) !== (w.name ?? null) && meta({ name: name.trim() || null })}
        returnKeyType="done"
      />
      <TextInput
        style={styles.descInput}
        value={desc}
        onChangeText={setDesc}
        placeholder="What is this workout about? (legs day, quick aerobic…)"
        placeholderTextColor={colors.muted}
        multiline
        onBlur={() => (desc.trim() || null) !== (w.description ?? null) && meta({ description: desc.trim() || null })}
      />
      <ChipRow>
        {tags.map((t) => <Chip key={t} label={t} color={slotColor[t as never] ?? colors.accent} on onPress={() => toggleTag(t)} />)}
        {suggested.map((t) => <Chip key={`s-${t}`} label={`+ ${t}`} on={false} onPress={() => toggleTag(t)} />)}
        {WORKOUT_TAGS.filter((t) => !tags.includes(t) && !suggested.includes(t)).map((t) => <Chip key={t} label={t} on={false} onPress={() => toggleTag(t)} />)}
      </ChipRow>
      <Text style={styles.small}>{fw.name} · {new Date(w.createdAt).toLocaleString()} · ≈ {Math.round(total / 60)} min of work{w.why ? `\n${w.why}` : ''}</Text>

      {fw.blocks.blocks.map((b) => {
        const o = ov(b.id);
        const rounds = b.kind === 'rounds' ? o.rounds ?? b.rounds ?? 1 : 1;
        const extraSlots = [...new Set(w.items.filter((i) => i.blockId === b.id && !b.slots.some((s) => s.id === i.slotId)).map((i) => i.slotId))];
        const allSlotIds: { id: string; slot: FrameworkSlot }[] = [...b.slots.map((s) => ({ id: s.id, slot: s })), ...extraSlots.map((id) => ({ id, slot: { id, tags: [...new Set(b.slots.flatMap((s) => s.tags))] } as FrameworkSlot }))];
        const title = b.kind === 'rounds' ? `${b.name} × ${rounds}` : b.seconds ? `${b.name} · ${Math.round(b.seconds / 60)} min` : b.name;
        return (
          <View key={b.id} style={[{ gap: 2, marginTop: space.s }, o.skipped && { opacity: 0.5 }]}>
            <SectionHeader
              title={o.skipped ? `${title} · skipped` : title}
              trailing={
                <View style={styles.headerTools}>
                  {b.kind === 'rounds' && !o.skipped && (
                    <>
                      <IconButton icon="remove" size={32} onPress={() => setOv(b.id, { rounds: Math.max(1, rounds - 1) })} />
                      <IconButton icon="add" size={32} onPress={() => setOv(b.id, { rounds: Math.min(8, rounds + 1) })} />
                      {rounds > 1 && (
                        <Pressable onPress={() => setBreakSheet(b.id)} hitSlop={8} style={styles.breakBtn}>
                          <Text style={styles.breakText}>{breakOf(b)} s break</Text>
                          <Ionicons name="chevron-down" size={14} color={colors.muted} />
                        </Pressable>
                      )}
                    </>
                  )}
                  <Pressable onPress={() => setOv(b.id, { skipped: !o.skipped })} hitSlop={8} style={[styles.skipBtn, o.skipped && { backgroundColor: colors.accentDeep }]}>
                    <Text style={[styles.skipText, o.skipped && { color: colors.onAccent }]}>{o.skipped ? 'include' : 'skip'}</Text>
                  </Pressable>
                </View>
              }
            />
            {!o.skipped && allSlotIds.map(({ id: sid, slot: s }, si) => {
              const it = w.items.find((i) => i.blockId === b.id && i.slotId === sid && i.round === 1);
              const ex = it ? byId.get(it.exerciseId) : undefined;
              const choose = () => setPicker({ blockId: b.id, slotId: sid, slot: s });
              const open = () => { const i = entries.findIndex((en) => en.blockId === b.id && en.slotId === sid); if (i >= 0) setView(i); else choose(); };
              return (
                <View key={sid}>
                  {si > 0 ? <Divider /> : null}
                  <SwipeRow disabled={!ex} actions={[{ label: 'Change', icon: 'albums-outline', color: colors.accentDeep, onPress: choose }, { label: 'Remove', icon: 'trash-outline', color: colors.danger, onPress: () => remove(b.id, sid) }]}>
                    <DrillRow ex={ex} clip={clips.get(ex)} dosage={it?.dosage} locked={it?.locked} onPress={open} missingText={`empty slot (${s.tags.join(' / ')}) · tap to choose`} />
                  </SwipeRow>
                </View>
              );
            })}
            {!o.skipped && (
              <Pressable onPress={() => setPicker({ blockId: b.id, slotId: 'extra', slot: { id: 'extra', tags: [...new Set(b.slots.flatMap((s) => s.tags))] } as FrameworkSlot, extra: true })} style={styles.addRow}>
                <Ionicons name="add-circle-outline" size={18} color={colors.accent} /><Text style={styles.link}>Add a drill to this section</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Button title="Delete this workout" ghost danger={false} onPress={confirmDelete} style={{ marginTop: space.l }} />

      {picker && (
        <ExercisePicker
          visible
          title={picker.extra ? 'Add a drill' : `Choose for ${picker.slot.tags.join(' / ')}`}
          exercises={exercises ?? []}
          preferTags={picker.slot.tags}
          inSectionIds={w.items.filter((i) => i.blockId === picker.blockId && i.slotId !== picker.slotId).map((i) => i.exerciseId)}
          onPick={(e) => (picker.extra ? addExtra(picker.blockId, e) : replace(picker.blockId, picker.slotId, e))}
          onClose={() => setPicker(null)}
        />
      )}
      {view !== null && entries.length > 0 && (
        <WorkoutViewer
          visible
          entries={entries}
          index={Math.min(view, entries.length - 1)}
          onIndex={setView}
          onClose={() => setView(null)}
          clipOf={(e) => clips.get(e)}
          actions={(en) => {
            const block = fw.blocks.blocks.find((b) => b.id === en.blockId)!;
            const slot = block.slots.find((s) => s.id === en.slotId) ?? ({ id: en.slotId, tags: [...new Set(block.slots.flatMap((s) => s.tags))] } as FrameworkSlot);
            return [
              { label: 'Replace', icon: 'albums-outline', onPress: () => { setView(null); setPicker({ blockId: en.blockId, slotId: en.slotId, slot }); } },
              { label: 'Less', icon: 'remove-circle-outline', onPress: () => adjust(en.blockId, en.slotId, -1) },
              { label: 'More', icon: 'add-circle-outline', onPress: () => adjust(en.blockId, en.slotId, 1) },
              { label: 'Card', icon: 'id-card-outline', onPress: () => { setView(null); router.push({ pathname: '/exercise/[id]', params: { id: en.exercise.id } }); } },
              { label: 'Remove', icon: 'trash-outline', destructive: true, onPress: () => { if (entries.length <= 1) setView(null); remove(en.blockId, en.slotId); } },
            ];
          }}
        />
      )}
      <Sheet visible={!!breakSheet} onClose={() => setBreakSheet(null)} title="Break between rounds">
        {BREAKS.map((r) => {
          const b = fw.blocks.blocks.find((x) => x.id === breakSheet);
          return <OptionRow key={r} label={`${r} s`} selected={!!b && breakOf(b) === r} onPress={() => { save(w.items, { ...w.inputs, restBetweenRoundsSec: r }); setBreakSheet(null); }} />;
        })}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1Input: { ...type.h2, color: colors.ink, paddingVertical: 4 },
  descInput: { ...type.body, fontSize: 14, color: colors.inkSoft, paddingVertical: 2, minHeight: 22 },
  small: { ...type.caption, color: colors.muted },
  headerTools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: space.s, borderRadius: radius.pill, backgroundColor: colors.surface },
  breakText: { ...type.caption, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  skipBtn: { minHeight: 32, paddingHorizontal: space.m, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  skipText: { ...type.caption, fontWeight: '700', color: colors.ink },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: hit.min, paddingHorizontal: space.xs },
  link: { ...type.body, fontSize: 14, fontWeight: '600', color: colors.accent },
});
