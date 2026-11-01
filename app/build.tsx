import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../src/db';
import { BUILT_FRAMEWORK_ID, SHAPES, buildWorkout, builderId, type Placed, type SectionShape } from '../src/db/builder';
import { saveBuiltWorkout, suggestWorkoutTags } from '../src/db/workoutRepo';
import { WORKOUT_TAGS, type WorkoutTag } from '../src/db/vocab';
import type { Exercise } from '../src/db/schema';
import { itemSeconds } from '../src/generator';
import { toGenExercise } from '../src/db/workoutRepo';
import { useClipCache } from '../src/ui/useClipCache';
import { Button, Chip, ChipRow, IconButton } from '../src/ui/Button';
import { Divider, OptionRow, Screen, SectionHeader, Sheet } from '../src/ui/primitives';
import { DrillRow, doseText } from '../src/ui/DrillRow';
import { DragHandle, DraggableList } from '../src/ui/DraggableList';
import { ExercisePicker } from '../src/ui/ExercisePicker';
import { SectionBankSheet } from '../src/ui/SectionBank';
import { colors, hit, radius, space, type } from '../src/ui/theme';

type Sec = SectionShape & { id: string };
const ROW_H = 84;
const STEPS = ['Shape', 'Place', 'Dose'] as const;

/**
 * Phase 10 — build a workout from drills picked in the Library (or from scratch): shape the sections,
 * place the drills (drag to reorder, move between sections, add from the library or the bank), dose them,
 * then save or start. The result owns its sections (workout.blocks).
 */
export default function BuildWorkout() {
  const router = useRouter();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const { data: frameworks } = useLiveQuery(db.select().from(schema.framework));
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);
  const clips = useClipCache(exercises);
  const [step, setStep] = useState(0);
  const [sections, setSections] = useState<Sec[]>([{ ...SHAPES.warmup, id: 'b1' }, { ...SHAPES.rounds, id: 'b2' }]);
  const [placed, setPlaced] = useState<Record<string, Placed[]>>({});
  const [name, setName] = useState('');
  const [tags, setTags] = useState<WorkoutTag[]>([]);
  const [moveSheet, setMoveSheet] = useState<{ sec: string; i: number } | null>(null);
  const [addFor, setAddFor] = useState<{ sec: string; kind: 'library' | 'bank' } | null>(null);
  const [fwSheet, setFwSheet] = useState(false);
  const seeded = React.useRef(false);

  // seed the picked drills into the main section once the library is loaded
  useEffect(() => {
    if (seeded.current || !exercises) return;
    seeded.current = true;
    const picked = (ids ?? '').split(',').filter(Boolean).map((id) => byId.get(id)).filter((e): e is Exercise => !!e);
    const main = sections.find((s) => s.kind === 'rounds') ?? sections[0];
    setPlaced({ [main.id]: picked.map(toPlaced) });
  }, [exercises]);

  const toPlaced = (e: Exercise): Placed => ({ exerciseId: e.id, dosage: e.dosageDefault ?? { type: 'time', value: 45 }, tags: e.slots });
  const secondsOf = (exerciseId: string, dosage: Placed['dosage']) => { const e = byId.get(exerciseId); return itemSeconds(e ? toGenExercise(e) : undefined, dosage); };
  const built = useMemo(() => buildWorkout(sections, placed), [sections, placed]);
  const totalWork = built.items.reduce((s, i) => s + secondsOf(i.exerciseId, i.dosage), 0);
  const drillCount = Object.values(placed).reduce((s, l) => s + l.length, 0);

  const toggleShape = (key: keyof typeof SHAPES) => {
    const shape = SHAPES[key];
    const has = sections.find((s) => s.name === shape.name);
    if (has) {
      if (sections.length === 1) return;
      const rest = sections.filter((s) => s.id !== has.id);
      const orphan = placed[has.id] ?? [];
      const target = rest.find((s) => s.kind === 'rounds') ?? rest[0];
      setSections(rest);
      setPlaced((p) => { const q = { ...p }; delete q[has.id]; q[target.id] = [...(q[target.id] ?? []), ...orphan]; return q; });
    } else {
      const order: (keyof typeof SHAPES)[] = ['warmup', 'rounds', 'finisher', 'cooldown'];
      const next = [...sections, { ...shape, id: builderId('b') }].sort((a, b) => order.findIndex((k) => SHAPES[k].name === a.name) - order.findIndex((k) => SHAPES[k].name === b.name));
      setSections(next);
    }
  };
  const fromFramework = (fwId: string) => {
    const fw = frameworks?.find((f) => f.id === fwId);
    if (!fw) return;
    const secs: Sec[] = fw.blocks.blocks.map((b) => ({ id: builderId('b'), name: b.name, kind: b.kind, rounds: b.kind === 'rounds' ? b.rounds ?? 1 : undefined }));
    const all = Object.values(placed).flat();
    const main = secs.find((s) => s.kind === 'rounds') ?? secs[0];
    setSections(secs);
    setPlaced(main ? { [main.id]: all } : {});
    setFwSheet(false);
  };
  const setRounds = (id: string, d: 1 | -1) => setSections((ss) => ss.map((s) => (s.id === id ? { ...s, rounds: Math.max(1, Math.min(8, (s.rounds ?? 1) + d)) } : s)));
  const reorder = (sec: string, from: number, to: number) => setPlaced((p) => { const l = [...(p[sec] ?? [])]; const [m] = l.splice(from, 1); l.splice(to, 0, m); return { ...p, [sec]: l }; });
  const moveTo = (fromSec: string, i: number, toSec: string) => setPlaced((p) => { const src = [...(p[fromSec] ?? [])]; const [m] = src.splice(i, 1); return { ...p, [fromSec]: src, [toSec]: [...(p[toSec] ?? []), m] }; });
  const remove = (sec: string, i: number) => setPlaced((p) => ({ ...p, [sec]: (p[sec] ?? []).filter((_, k) => k !== i) }));
  const adjust = (sec: string, i: number, d: 1 | -1) => setPlaced((p) => ({ ...p, [sec]: (p[sec] ?? []).map((x, k) => (k !== i ? x : { ...x, dosage: { ...x.dosage, value: x.dosage.type === 'time' ? Math.max(10, x.dosage.value + d * 15) : Math.max(1, x.dosage.value + d * 2) } })) }));
  const toggleType = (sec: string, i: number) => setPlaced((p) => ({ ...p, [sec]: (p[sec] ?? []).map((x, k) => (k !== i ? x : { ...x, dosage: x.dosage.type === 'time' ? { type: 'reps', value: 10, perSide: x.dosage.perSide } : { type: 'time', value: 45, perSide: x.dosage.perSide } })) }));
  const togglePerSide = (sec: string, i: number) => setPlaced((p) => ({ ...p, [sec]: (p[sec] ?? []).map((x, k) => (k !== i ? x : { ...x, dosage: { ...x.dosage, perSide: !x.dosage.perSide } })) }));

  const save = async (start: boolean) => {
    if (drillCount === 0) { Alert.alert('No drills', 'Add at least one drill.'); return; }
    const sugg = suggestWorkoutTags(built.items, byId);
    const id = await saveBuiltWorkout(db, { name: name.trim() || null, tags: tags.length ? tags : sugg, blocks: built.blocks, items: built.items, why: `built by hand · ${sections.map((s) => s.name).join(' + ')}` });
    if (start) router.replace({ pathname: '/player/[workoutId]', params: { workoutId: id } });
    else router.replace({ pathname: '/workout/[id]', params: { id } });
  };

  const footer = (
    <View style={styles.footer}>
      {step > 0 ? <IconButton icon="chevron-back" size={56} onPress={() => setStep(step - 1)} /> : <View style={{ width: 56 }} />}
      {step < 2 ? (
        <Button title={`${STEPS[step + 1]} →`} size="l" onPress={() => setStep(step + 1)} style={{ flex: 1 }} />
      ) : (
        <>
          <Button title="Save" size="l" secondary onPress={() => save(false)} style={{ flex: 1 }} />
          <Button title="Save & start" size="l" icon="play" onPress={() => save(true)} style={{ flex: 1.4 }} />
        </>
      )}
    </View>
  );

  return (
    <Screen scroll footer={footer} contentStyle={{ gap: space.m }}>
      <View style={styles.stepper}>
        {STEPS.map((s, i) => (
          <Pressable key={s} onPress={() => setStep(i)} style={styles.stepItem}>
            <View style={[styles.stepDot, i <= step && { backgroundColor: colors.accent }]} />
            <Text style={[styles.stepText, i === step && { color: colors.ink }]}>{s}</Text>
          </Pressable>
        ))}
        <Text style={styles.total}>{drillCount} drills · ≈ {Math.round(totalWork / 60)} min</Text>
      </View>

      {step === 0 && (
        <View style={{ gap: space.m }}>
          <Text style={styles.lead}>Which sections does this workout have?</Text>
          <ChipRow>
            {(Object.keys(SHAPES) as (keyof typeof SHAPES)[]).map((k) => <Chip key={k} label={SHAPES[k].name} on={sections.some((s) => s.name === SHAPES[k].name)} onPress={() => toggleShape(k)} />)}
            <Chip label="From a framework…" icon="construct-outline" on={false} onPress={() => setFwSheet(true)} />
          </ChipRow>
          {sections.map((s) => (
            <View key={s.id} style={styles.shapeRow}>
              <Text style={styles.shapeName}>{s.name}</Text>
              {s.kind === 'rounds' ? (
                <View style={styles.rounds}>
                  <IconButton icon="remove" size={36} onPress={() => setRounds(s.id, -1)} />
                  <Text style={styles.roundsText}>× {s.rounds ?? 1}</Text>
                  <IconButton icon="add" size={36} onPress={() => setRounds(s.id, 1)} />
                </View>
              ) : <Text style={styles.small}>once, in order</Text>}
            </View>
          ))}
        </View>
      )}

      {step === 1 && sections.map((sec) => {
        const list = placed[sec.id] ?? [];
        return (
          <View key={sec.id} style={{ gap: 2 }}>
            <SectionHeader
              title={sec.kind === 'rounds' ? `${sec.name} × ${sec.rounds ?? 1}` : sec.name}
              trailing={<View style={styles.tools}><IconButton icon="albums-outline" size={32} onPress={() => setAddFor({ sec: sec.id, kind: 'bank' })} /><IconButton icon="add" size={32} onPress={() => setAddFor({ sec: sec.id, kind: 'library' })} /></View>}
            />
            {list.length === 0 ? <Text style={styles.empty}>No drills here yet. Tap + to add, or move one from another section.</Text> : null}
            <DraggableList
              data={list}
              keyOf={(p, i) => `${p.exerciseId}-${i}`}
              rowHeight={ROW_H}
              onReorder={(f, t) => reorder(sec.id, f, t)}
              render={(p, i, dragging, lift) => {
                const ex = byId.get(p.exerciseId);
                return (
                  <View style={{ height: ROW_H, justifyContent: 'center' }}>
                    {i > 0 && !dragging ? <Divider style={{ position: 'absolute', top: 0, left: 0, right: 0 }} /> : null}
                    <DrillRow ex={ex} clip={clips.get(ex)} dosage={p.dosage} onPress={() => setMoveSheet({ sec: sec.id, i })} onLongPress={lift} trailing={<DragHandle onLift={lift} dragging={dragging} />} />
                  </View>
                );
              }}
            />
          </View>
        );
      })}

      {step === 2 && (
        <View style={{ gap: space.m }}>
          <TextInput style={styles.nameInput} value={name} onChangeText={setName} placeholder="Name this workout (optional)" placeholderTextColor={colors.muted} returnKeyType="done" />
          <ChipRow>{WORKOUT_TAGS.map((t) => <Chip key={t} label={t} on={tags.includes(t)} onPress={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} />)}</ChipRow>
          {sections.map((sec) => (
            <View key={sec.id} style={{ gap: 2 }}>
              <SectionHeader title={sec.kind === 'rounds' ? `${sec.name} × ${sec.rounds ?? 1}` : sec.name} />
              {(placed[sec.id] ?? []).map((p, i) => {
                const ex = byId.get(p.exerciseId);
                return (
                  <View key={`${p.exerciseId}-${i}`}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.doseRow}>
                      <Text style={styles.doseName} numberOfLines={1}>{ex?.name ?? '?'}</Text>
                      <View style={styles.doseTools}>
                        <IconButton icon="remove" size={36} onPress={() => adjust(sec.id, i, -1)} />
                        <Pressable onPress={() => toggleType(sec.id, i)} hitSlop={6} style={styles.dosePill}><Text style={styles.doseText}>{doseText(p.dosage)}</Text></Pressable>
                        <IconButton icon="add" size={36} onPress={() => adjust(sec.id, i, 1)} />
                        <Chip label="/ side" on={!!p.dosage.perSide} onPress={() => togglePerSide(sec.id, i)} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          <Text style={styles.small}>Tap the dosage to switch between time and reps. Rests use the defaults (15 s between drills, 60 s between sections, 90 s between rounds); change them on the workout screen after saving.</Text>
        </View>
      )}

      <Sheet visible={!!moveSheet} onClose={() => setMoveSheet(null)} title="This drill">
        {moveSheet && sections.filter((s) => s.id !== moveSheet.sec).map((s) => <OptionRow key={s.id} icon="arrow-forward-outline" label={`Move to ${s.name}`} onPress={() => { moveTo(moveSheet.sec, moveSheet.i, s.id); setMoveSheet(null); }} />)}
        {moveSheet && <OptionRow icon="trash-outline" label="Remove from this workout" onPress={() => { remove(moveSheet.sec, moveSheet.i); setMoveSheet(null); }} />}
      </Sheet>
      <Sheet visible={fwSheet} onClose={() => setFwSheet(false)} title="Sections from a framework">
        {(frameworks ?? []).map((f) => <OptionRow key={f.id} label={f.name} caption={f.blocks.blocks.map((b) => `${b.name}${b.kind === 'rounds' ? ` ×${b.rounds ?? 1}` : ''}`).join(' · ')} onPress={() => fromFramework(f.id)} />)}
      </Sheet>
      {addFor?.kind === 'library' && (
        <ExercisePicker visible title={`Add to ${sections.find((s) => s.id === addFor.sec)?.name ?? 'section'}`} exercises={exercises ?? []} inSectionIds={(placed[addFor.sec] ?? []).map((p) => p.exerciseId)} onPick={(e) => { setPlaced((p) => ({ ...p, [addFor.sec]: [...(p[addFor.sec] ?? []), toPlaced(e)] })); setAddFor(null); }} onClose={() => setAddFor(null)} />
      )}
      <SectionBankSheet visible={addFor?.kind === 'bank'} onClose={() => setAddFor(null)} exercisesById={byId} title="Add a saved section's drills" onPick={(preset) => { if (!addFor) return; setPlaced((p) => ({ ...p, [addFor.sec]: [...(p[addFor.sec] ?? []), ...preset.drills.map((d) => ({ exerciseId: d.exerciseId, dosage: d.dosage, tags: byId.get(d.exerciseId)?.slots }))] })); setAddFor(null); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.l, flexWrap: 'wrap' },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: hit.min },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.line },
  stepText: { ...type.bodyStrong, color: colors.muted },
  total: { ...type.caption, color: colors.muted, marginStart: 'auto' },
  lead: { ...type.h3, color: colors.ink },
  shapeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: space.m, borderRadius: radius.m, backgroundColor: colors.surface },
  shapeName: { ...type.bodyStrong, color: colors.ink },
  rounds: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  roundsText: { ...type.bodyStrong, color: colors.ink, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'center' },
  small: { ...type.caption, color: colors.muted },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { ...type.body, fontSize: 14, color: colors.muted, paddingVertical: space.s },
  nameInput: { ...type.h3, color: colors.ink, backgroundColor: colors.surface, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: 48 },
  doseRow: { paddingVertical: space.s, gap: 6 },
  doseName: { ...type.bodyStrong, color: colors.ink },
  doseTools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dosePill: { minWidth: 96, minHeight: 36, paddingHorizontal: space.m, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  doseText: { ...type.bodyStrong, color: colors.ink, fontVariant: ['tabular-nums'] },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.s },
});
