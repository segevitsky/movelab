import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { useClipCache } from '../../src/ui/useClipCache';
import { deleteWorkout, loadGenContext, saveWorkout } from '../../src/db/workoutRepo';
import type { Workout } from '../../src/db/schema';
import type { WorkoutInputs } from '../../src/db/types';
import { SLOTS, type Slot } from '../../src/db/vocab';
import { generate, swap, slotKey, itemSeconds, type GenContext, type GenWorkout } from '../../src/generator';
import type { FrameworkSlot } from '../../src/db/types';
import { Button, Chip, ChipRow, IconButton, Tag } from '../../src/ui/Button';
import { Divider, OptionRow, PromptSheet, Screen, SectionHeader, Sheet, TitleBar } from '../../src/ui/primitives';
import { SectionBankSheet } from '../../src/ui/SectionBank';
import { applySection, sectionDrills } from '../../src/db/sections';
import { saveSectionPreset } from '../../src/db/sectionRepo';
import { DrillRow } from '../../src/ui/DrillRow';
import { GuidanceStrip } from '../../src/ui/Guidance';
import { fingerprintOf, type ReportDrill } from '../../src/similarity';
import { SwipeRow } from '../../src/ui/SwipeRow';
import { ExercisePicker } from '../../src/ui/ExercisePicker';
import { WorkoutViewer, type ViewerEntry } from '../../src/ui/WorkoutViewer';
import { Drop, Rise } from '../../src/ui/motion';
import { colors, hit, radius, slotColor, space, type } from '../../src/ui/theme';

const SURPRISE: [number, string][] = [[0, 'safe'], [0.3, 'mix'], [0.8, 'surprise me']];
const BREAKS = [60, 90, 120, 180];
const DRILL_RESTS = [0, 15, 30, 45];
const SECTION_BREAKS = [0, 30, 60, 90, 120];

export default function Today() {
  const router = useRouter();
  const { data: frameworks } = useLiveQuery(db.select().from(schema.framework));
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);
  const clips = useClipCache(exercises);
  const [fwId, setFwId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<WorkoutInputs>({ energy: 'medium', focus: null, surprise: 0.3 });
  const [ctx, setCtx] = useState<GenContext | null>(null);
  const [w, setW] = useState<GenWorkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [sheet, setSheet] = useState<'inputs' | 'menu' | 'break' | null>(null);
  const [saveFor, setSaveFor] = useState<string | null>(null);
  const [bankFor, setBankFor] = useState<string | null>(null);
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
  const [view, setView] = useState<number | null>(null);
  const fw = frameworks?.find((f) => f.id === fwId);
  // the drills of this workout in play order (round 1), for the viewer
  const entries: ViewerEntry[] = useMemo(() => {
    if (!w || !fw) return [];
    const out: ViewerEntry[] = [];
    for (const b of fw.blocks.blocks) {
      const known = new Set(b.slots.map((s) => s.id));
      const round1 = w.items.filter((i) => i.blockId === b.id && i.round === 1);
      const ordered = [...b.slots.map((s) => round1.find((i) => i.slotId === s.id)).filter((i): i is NonNullable<typeof i> => !!i), ...round1.filter((i) => !known.has(i.slotId))];
      for (const it of ordered) {
        const ex = byId.get(it.exerciseId);
        if (ex) out.push({ blockId: b.id, slotId: it.slotId, sectionName: b.name, exercise: ex, dosage: it.dosage, locked: it.locked });
      }
    }
    return out;
  }, [w, fw, byId]);
  const reportDrills: ReportDrill[] = useMemo(() => entries.map((en) => ({ id: en.exercise.id, name: en.exercise.name, sectionId: en.blockId, sectionName: en.sectionName, pattern: en.exercise.pattern, slots: en.exercise.slots, fp: fingerprintOf(en.exercise), seconds: 0 })), [entries]);
  const avoid = useMemo(() => entries.map((en) => ({ id: en.exercise.id, name: en.exercise.name, fp: fingerprintOf(en.exercise) })), [entries]);
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
    else Alert.alert('Saved', 'It counts as history now. Start it from Recent any time.');
  };
  const confirmDelete = (r: Workout) => Alert.alert('Delete this workout?', 'It leaves your history too.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteWorkout(db, r.id) }]);

  const surpriseLabel = SURPRISE.find(([v]) => v === inputs.surprise)?.[1] ?? 'mix';
  const strip = [fw?.name ?? 'framework', inputs.energy, inputs.focus, surpriseLabel].filter(Boolean).join(' · ');
  const totalMin = w ? Math.round(w.totalSeconds / 60) : 0;
  const breakSec = (b: { id: string; restBetweenRoundsSec?: number }) => w?.inputs.restBetweenRoundsSec ?? b.restBetweenRoundsSec ?? 0;

  const footer = w ? (
    <View style={styles.footerRow}>
      <IconButton icon="shuffle" size={56} onPress={() => run()} disabled={busy} />
      <Button title={busy ? 'Generating…' : `Start · ${totalMin} min`} size="l" icon="play" onPress={() => save(true)} disabled={busy} style={{ flex: 1 }} />
    </View>
  ) : (
    <Button title={busy ? 'Generating…' : "Today's workout"} size="l" icon="sparkles" onPress={() => run()} disabled={busy || !fwId} />
  );

  return (
    <Screen scroll footer={footer} contentStyle={{ gap: space.m }}>
      <TitleBar title="MoveLab" icon={require('../../assets/icon.png')} iconSize={64} eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} style={{ paddingHorizontal: 0 }} trailing={<IconButton icon="ellipsis-horizontal" size={hit.min} onPress={() => setSheet('menu')} />} />
      <Pressable onPress={() => setSheet('inputs')} style={({ pressed }) => [styles.strip, pressed && { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="options-outline" size={18} color={colors.inkSoft} />
        <Text style={styles.stripText} numberOfLines={1}>{strip}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>

      {w && fw && (
        <View style={{ gap: space.l }}>
          <Drop index={0} style={styles.why}>
            <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
            <Text style={styles.whyText}>{w.why}</Text>
          </Drop>
          <GuidanceStrip drills={reportDrills} />
          {fw.blocks.blocks.map((b, bi) => {
            const its = w.items.filter((i) => i.blockId === b.id && i.round === 1);
            const rounds = b.kind === 'rounds' ? b.rounds ?? 1 : 1;
            const title = rounds > 1 ? `${b.name} × ${rounds}` : b.seconds ? `${b.name} · ${Math.round(b.seconds / 60)} min` : b.name;
            return (
              <Drop key={b.id} index={bi} style={{ gap: 2 }}>
                <SectionHeader
                  title={title}
                  trailing={
                    <View style={styles.headerTools}>
                      {rounds > 1 && (
                        <Pressable onPress={() => setSheet('break')} hitSlop={8} style={styles.breakBtn}>
                          <Text style={styles.breakText}>{breakSec(b)} s break</Text>
                          <Ionicons name="chevron-down" size={14} color={colors.muted} />
                        </Pressable>
                      )}
                      <IconButton icon="bookmark-outline" size={32} onPress={() => setSaveFor(b.id)} />
                      <IconButton icon="albums-outline" size={32} onPress={() => setBankFor(b.id)} />
                    </View>
                  }
                />
                {b.slots.map((s, si) => {
                  const it = its.find((i) => i.slotId === s.id);
                  const ex = it ? byId.get(it.exerciseId) : undefined;
                  const open = () => { const i = entries.findIndex((en) => en.blockId === b.id && en.slotId === s.id); if (i >= 0) setView(i); };
                  const choose = () => setPicker({ blockId: b.id, slotId: s.id, slot: s });
                  return (
                    <Rise key={`${s.id}-${it?.exerciseId ?? 'none'}`} index={si}>
                      {si > 0 ? <Divider /> : null}
                      <SwipeRow disabled={!ex} actions={[
                        { label: 'Choose', icon: 'albums-outline', color: colors.accentDeep, onPress: choose },
                        { label: 'Remove', icon: 'trash-outline', color: colors.danger, onPress: () => removeItem(b.id, s.id) },
                      ]}>
                        <DrillRow ex={ex} clip={clips.get(ex)} dosage={it?.dosage} locked={it?.locked} onPress={ex ? open : choose} missingText={`no card for ${s.tags.join(' / ')} yet${s.optional ? ' (optional)' : ''} · tap to choose`} />
                      </SwipeRow>
                    </Rise>
                  );
                })}
                {w.items.filter((i) => i.blockId === b.id && i.round === 1 && !b.slots.some((s) => s.id === i.slotId)).map((it, xi) => {
                  const ex = byId.get(it.exerciseId);
                  const open = () => { const i = entries.findIndex((en) => en.blockId === b.id && en.slotId === it.slotId); if (i >= 0) setView(i); };
                  return (
                    <View key={it.slotId}>
                      {(xi > 0 || b.slots.length > 0) ? <Divider /> : null}
                      <SwipeRow disabled={!ex} actions={[{ label: 'Remove', icon: 'trash-outline', color: colors.danger, onPress: () => setW({ ...w, items: w.items.filter((i) => !(i.blockId === b.id && i.slotId === it.slotId)) }) }]}>
                        <DrillRow ex={ex} clip={clips.get(ex)} dosage={it.dosage} locked={it.locked} onPress={open} />
                      </SwipeRow>
                    </View>
                  );
                })}
              </Drop>
            );
          })}
        </View>
      )}
      {!w && (exercises?.length ?? 0) === 0 && <Text style={styles.note}>Your library is empty — capture a few reels first.</Text>}

      {recentList.length > 0 && (
        <View style={{ gap: 2, marginTop: space.s }}>
          <SectionHeader title="Recent" />
          {recentList.map((r: Workout, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <SwipeRow actions={[{ label: 'Delete', icon: 'trash-outline', color: colors.danger, onPress: () => confirmDelete(r) }]}>
                <Pressable style={({ pressed }) => [styles.recentRow, pressed && { backgroundColor: colors.surfaceAlt }]} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: r.id } })} onLongPress={() => confirmDelete(r)}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.recentName} numberOfLines={1}>{r.name?.trim() || frameworks?.find((f) => f.id === r.frameworkId)?.name || (r.blocks ? 'Built workout' : 'workout')}</Text>
                    <Text style={styles.recentMeta} numberOfLines={1}>{new Date(r.createdAt).toLocaleDateString()} · {r.description?.trim() || r.why || `${r.items.length} items`}</Text>
                    {!!r.tags?.length && <View style={styles.tagRow}>{r.tags.slice(0, 3).map((t) => <Tag key={t} label={t} color={slotColor[t as never] ?? colors.muted} />)}</View>}
                  </View>
                  <IconButton icon="play" size={hit.min} onPress={() => router.push({ pathname: '/player/[workoutId]', params: { workoutId: r.id } })} />
                </Pressable>
              </SwipeRow>
            </View>
          ))}
        </View>
      )}

      {picker && w && (
        <ExercisePicker
          visible
          title={`Choose a drill · ${picker.slot.tags.join(' / ')}`}
          exercises={exercises ?? []}
          preferTags={picker.slot.tags}
          inSectionIds={w.items.filter((i) => i.blockId === picker.blockId && i.slotId !== picker.slotId).map((i) => i.exerciseId)}
          avoid={avoid.filter((a) => !w.items.some((i) => i.blockId === picker.blockId && i.slotId === picker.slotId && i.exerciseId === a.id))}
          onPick={(e) => chooseFromLibrary(picker.blockId, picker.slotId, e.id)}
          onClose={() => setPicker(null)}
        />
      )}
      {view !== null && w && fw && (
        <WorkoutViewer
          visible
          entries={entries}
          index={Math.min(view, Math.max(0, entries.length - 1))}
          onIndex={setView}
          onClose={() => setView(null)}
          clipOf={(e) => clips.get(e)}
          actions={(en) => {
            const slot = fw.blocks.blocks.find((b) => b.id === en.blockId)?.slots.find((s) => s.id === en.slotId);
            return [
              { label: 'Replace', icon: 'albums-outline', onPress: () => { setView(null); if (slot) setPicker({ blockId: en.blockId, slotId: en.slotId, slot }); } },
              { label: 'Surprise me', icon: 'shuffle-outline', onPress: () => doSwap(en.blockId, en.slotId) },
              { label: en.locked ? 'Unlock' : 'Lock', icon: en.locked ? 'lock-open-outline' : 'lock-closed-outline', onPress: () => toggleLock(en.blockId, en.slotId) },
              { label: 'Less', icon: 'remove-circle-outline', onPress: () => adjust(en.blockId, en.slotId, -1) },
              { label: 'More', icon: 'add-circle-outline', onPress: () => adjust(en.blockId, en.slotId, 1) },
              { label: 'Card', icon: 'id-card-outline', onPress: () => { setView(null); router.push({ pathname: '/exercise/[id]', params: { id: en.exercise.id } }); } },
              { label: 'Remove', icon: 'trash-outline', destructive: true, onPress: () => { setView(null); removeItem(en.blockId, en.slotId); } },
            ];
          }}
        />
      )}

      <PromptSheet
        visible={!!saveFor}
        title="Save this section"
        placeholder="e.g. Saturday warm-up"
        initial={fw?.blocks.blocks.find((b) => b.id === saveFor)?.name ?? ''}
        onClose={() => setSaveFor(null)}
        onConfirm={async (name) => {
          const b = fw?.blocks.blocks.find((x) => x.id === saveFor);
          if (!b || !w) return;
          const drills = sectionDrills(w.items, b.id, b.slots.map((s) => s.id));
          if (drills.length === 0) { Alert.alert('Nothing to save', 'This section has no drills yet.'); return; }
          await saveSectionPreset(db, { name, drills, fromBlockName: b.name });
          setSaveFor(null);
          Alert.alert('Saved', `"${name}" · ${drills.length} drills.`);
        }}
      />
      <SectionBankSheet
        visible={!!bankFor}
        onClose={() => setBankFor(null)}
        exercisesById={byId}
        onPick={(preset) => {
          const b = fw?.blocks.blocks.find((x) => x.id === bankFor);
          if (!b || !w || !ctx) return;
          const rounds = b.kind === 'rounds' ? b.rounds ?? 1 : 1;
          const lib = new Map(ctx.library.map((e) => [e.id, e]));
          const items = applySection(w.items, b.id, rounds, preset.drills).map((i) => ('seconds' in i ? i : { ...i, seconds: itemSeconds(lib.get(i.exerciseId), i.dosage) }));
          setW({ ...w, items: items as typeof w.items, unfilled: w.unfilled.filter((u) => u.blockId !== b.id) });
          setBankFor(null);
        }}
      />
      <Sheet visible={sheet === 'inputs'} onClose={() => setSheet(null)} title="Today's inputs">
        <Text style={styles.sheetLabel}>Framework</Text>
        <ChipRow>{(frameworks ?? []).map((f) => <Chip key={f.id} label={f.name} on={f.id === fwId} onPress={() => setFwId(f.id)} />)}</ChipRow>
        <Text style={styles.sheetLabel}>Energy</Text>
        <ChipRow>{(['low', 'medium', 'high'] as const).map((e) => <Chip key={e} label={e} on={inputs.energy === e} onPress={() => setInputs({ ...inputs, energy: e })} />)}</ChipRow>
        <Text style={styles.sheetLabel}>Focus (optional)</Text>
        <ChipRow>{SLOTS.map((s) => <Chip key={s} label={s} color={slotColor[s] ?? colors.accent} on={inputs.focus === s} onPress={() => setInputs({ ...inputs, focus: inputs.focus === s ? null : (s as Slot) })} />)}</ChipRow>
        <Text style={styles.sheetLabel}>Rest between drills</Text>
        <ChipRow>{DRILL_RESTS.map((r) => <Chip key={r} label={`${r} s`} on={(inputs.restBetweenExercisesSec ?? 15) === r} onPress={() => setInputs({ ...inputs, restBetweenExercisesSec: r })} />)}</ChipRow>
        <Text style={styles.sheetLabel}>Break between sections</Text>
        <ChipRow>{SECTION_BREAKS.map((r) => <Chip key={r} label={`${r} s`} on={(inputs.restBetweenSectionsSec ?? 60) === r} onPress={() => setInputs({ ...inputs, restBetweenSectionsSec: r })} />)}</ChipRow>
        <Text style={styles.sheetLabel}>Surprise</Text>
        <ChipRow>{SURPRISE.map(([v, l]) => <Chip key={String(v)} label={l} on={inputs.surprise === v} onPress={() => setInputs({ ...inputs, surprise: v })} />)}</ChipRow>
        <Button title={w ? 'Generate again' : 'Generate'} size="l" icon="sparkles" onPress={() => { setSheet(null); run(); }} disabled={busy || !fwId} style={{ marginTop: space.s }} />
      </Sheet>
      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)}>
        {w ? <OptionRow label="Save for later without starting" icon="bookmark-outline" onPress={() => { setSheet(null); save(false); }} /> : null}
        <OptionRow label="Build a workout by hand" icon="hammer-outline" onPress={() => { setSheet(null); router.push('/build'); }} />
        <OptionRow label="Edit frameworks" icon="construct-outline" onPress={() => { setSheet(null); router.push('/frameworks'); }} />
      </Sheet>
      <Sheet visible={sheet === 'break'} onClose={() => setSheet(null)} title="Break between rounds">
        {BREAKS.map((r) => <OptionRow key={r} label={`${r} s`} selected={!!w && fw?.blocks.blocks.some((b) => b.kind === 'rounds' && breakSec(b) === r)} onPress={() => { if (w) setW({ ...w, inputs: { ...w.inputs, restBetweenRoundsSec: r } }); setSheet(null); }} />)}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit.min, paddingHorizontal: space.m, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  stripText: { ...type.body, fontSize: 14, color: colors.inkSoft, flex: 1 },
  why: { flexDirection: 'row', gap: space.s, alignItems: 'center', padding: space.m, borderRadius: radius.m, backgroundColor: colors.accentSoft },
  whyText: { ...type.body, fontSize: 14, color: colors.ink, flex: 1 },
  headerTools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: space.s, borderRadius: radius.pill, backgroundColor: colors.surface },
  breakText: { ...type.caption, color: colors.inkSoft, fontVariant: ['tabular-nums'] },
  note: { ...type.body, color: colors.muted },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s, paddingHorizontal: space.xs, borderRadius: radius.m },
  recentName: { ...type.bodyStrong, color: colors.ink },
  recentMeta: { ...type.caption, color: colors.muted },
  tagRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  sheetLabel: { ...type.label, color: colors.muted, marginTop: space.s },
});
