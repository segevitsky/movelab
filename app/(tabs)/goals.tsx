import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { useClipCache } from '../../src/ui/useClipCache';
import { addStage, createGoal, deleteGoal, linkStageExercise, markStagePassed, removeStage, setCurrentStage, setGoalActive, updateStage } from '../../src/db/goalRepo';
import type { Goal } from '../../src/db/schema';
import { SLOTS, type Slot } from '../../src/db/vocab';
import { FigureStill } from '../../src/figure';
import { Button, Chip, Tag } from '../../src/ui/Button';
import { ExercisePicker } from '../../src/ui/ExercisePicker';
import { colors, radius, shadow, slotColor, tint } from '../../src/ui/theme';

/**
 * Phase 7. A goal is a ladder of stages; each stage is a drill from the library. The current stage of
 * every active goal takes the skill slot in generated workouts (up to 3 goals rotate). Stages without
 * a drill ask for one — choose from the library or capture a reel.
 */
export default function Goals() {
  const router = useRouter();
  const { data: goals } = useLiveQuery(db.select().from(schema.goal));
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);
  const clips = useClipCache(exercises);
  const [picker, setPicker] = useState<{ goal: Goal; stage: number } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editStage, setEditStage] = useState<{ goal: Goal; stage: number } | null>(null);
  const active = (goals ?? []).filter((g) => g.active).length;
  const sorted = (goals ?? []).slice().sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.hint}>Active goals put their current drill into the skill slot of every workout ({active} active{active > 3 ? ' · only the 3 least recent are used each time' : ', up to 3 rotate'}). Mark a stage passed to move up the ladder.</Text>
        {sorted.map((g) => {
          const cur = g.stages[g.currentStage];
          const ex = cur?.exerciseId ? byId.get(cur.exerciseId) : undefined;
          const clip = clips.get(ex);
          const color = (g.slot && slotColor[g.slot]) || colors.accent;
          const open = expanded === g.id;
          const done = g.currentStage >= g.stages.length - 1 && !g.active && !!g.notes?.includes('completed');
          return (
            <View key={g.id} style={[styles.card, shadow.card, { borderLeftColor: color }, !g.active && { opacity: 0.85 }]}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{g.name}</Text>
                  <Text style={styles.small}>stage {Math.min(g.currentStage + 1, g.stages.length)} of {g.stages.length} · <Text style={{ color }}>{g.slot}</Text>{done ? ' · completed' : ''}</Text>
                </View>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Switch value={g.active} onValueChange={(v) => setGoalActive(db, g.id, v)} />
                  <Text style={styles.tiny}>{g.active ? 'in workouts' : 'paused'}</Text>
                </View>
              </View>
              <View style={styles.progress}>{g.stages.map((_, i) => <View key={i} style={[styles.pip, { backgroundColor: i < g.currentStage ? color : i === g.currentStage ? tint(color, 0.5) : colors.line }]} />)}</View>

              {cur && (
                <View style={styles.current}>
                  <View style={styles.thumb}>{clip ? <FigureStill clip={clip} width={72} height={88} /> : <Ionicons name={ex ? 'body-outline' : 'help-outline'} size={26} color={colors.muted} />}</View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.stageName}>{cur.name}</Text>
                    <Text style={styles.small}>pass: {cur.criterion}</Text>
                    {ex ? (
                      <View style={styles.row}>
                        <Tag label={ex.name} color={color} />
                        <Pressable onPress={() => setPicker({ goal: g, stage: g.currentStage })} hitSlop={6}><Text style={styles.link}>change</Text></Pressable>
                      </View>
                    ) : (
                      <View style={[styles.needs, { backgroundColor: tint(color, 0.12) }]}>
                        <Text style={[styles.needsText, { color }]}>Needs a drill for this stage</Text>
                        <View style={styles.row}>
                          <Pressable onPress={() => setPicker({ goal: g, stage: g.currentStage })} style={[styles.miniBtn, { backgroundColor: color }]}><Text style={styles.miniBtnText}>Choose from library</Text></Pressable>
                          <Pressable onPress={() => router.push('/dev')} style={[styles.miniBtn, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.miniBtnText, { color: colors.ink }]}>Capture one</Text></Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              )}
              <View style={styles.row}>
                {g.active && cur && <Button title={g.currentStage >= g.stages.length - 1 ? 'Goal reached ✓' : 'Stage passed → next'} onPress={() => Alert.alert(`Passed "${cur.name}"?`, cur.criterion, [{ text: 'Not yet' }, { text: 'Yes, next stage', onPress: () => markStagePassed(db, g) }])} />}
                <Pressable onPress={() => setExpanded(open ? null : g.id)} style={styles.moreBtn}><Text style={styles.link}>{open ? 'Hide stages' : 'All stages'}</Text></Pressable>
              </View>

              {open && (
                <View style={{ gap: 6 }}>
                  {g.stages.map((s, i) => {
                    const sx = s.exerciseId ? byId.get(s.exerciseId) : undefined;
                    return (
                      <Pressable key={i} onPress={() => setEditStage({ goal: g, stage: i })} style={[styles.stageRow, i === g.currentStage && { backgroundColor: tint(color, 0.1) }]}>
                        <Text style={[styles.idx, i < g.currentStage && { color }]}>{i < g.currentStage ? '✓' : i + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.stageName}>{s.name}</Text>
                          <Text style={styles.small}>{s.criterion}{sx ? ` · ${sx.name}` : ' · no drill yet'}</Text>
                        </View>
                        <Pressable onPress={() => setPicker({ goal: g, stage: i })} hitSlop={8}><Ionicons name={sx ? 'swap-horizontal' : 'add-circle-outline'} size={20} color={sx ? colors.muted : color} /></Pressable>
                      </Pressable>
                    );
                  })}
                  <View style={styles.row}>
                    <Pressable onPress={() => setEditStage({ goal: g, stage: -1 })}><Text style={styles.link}>+ Add stage</Text></Pressable>
                    <Pressable onPress={() => Alert.alert('Delete goal?', g.name, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteGoal(db, g.id) }])}><Text style={[styles.link, { color: colors.danger }]}>Delete goal</Text></Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}
        <Button title="+ New goal" onPress={() => setCreating(true)} secondary />
      </ScrollView>

      {picker && (
        <ExercisePicker
          visible
          title={`${picker.goal.name} · ${picker.goal.stages[picker.stage]?.name ?? 'stage'}`}
          exercises={exercises ?? []}
          preferTags={picker.goal.slot ? [picker.goal.slot, 'skill'] : ['skill']}
          onPick={(e) => { linkStageExercise(db, picker.goal, picker.stage, e.id); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {creating && <GoalEditor onClose={() => setCreating(false)} />}
      {editStage && <StageEditor goal={editStage.goal} index={editStage.stage} onClose={() => setEditStage(null)} />}
    </View>
  );
}

function StageEditor({ goal, index, onClose }: { goal: Goal; index: number; onClose: () => void }) {
  const isNew = index < 0;
  const st = isNew ? null : goal.stages[index];
  const [name, setName] = useState(st?.name ?? '');
  const [criterion, setCriterion] = useState(st?.criterion ?? '');
  const save = async () => {
    if (!name.trim()) return;
    if (isNew) await addStage(db, goal, { name: name.trim(), criterion: criterion.trim() });
    else await updateStage(db, goal, index, { name: name.trim(), criterion: criterion.trim() });
    onClose();
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>{isNew ? 'New stage' : `Stage ${index + 1}`}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Stage name (e.g. Tuck L-sit)" autoFocus={isNew} />
        <TextInput style={styles.input} value={criterion} onChangeText={setCriterion} placeholder="Pass criterion (e.g. 3 × 20 s clean)" />
        <View style={styles.row}>
          {!isNew && <Button title="Make current" onPress={() => { setCurrentStage(db, goal, index); onClose(); }} secondary />}
          {!isNew && goal.stages.length > 1 && <Button title="Remove" onPress={() => { removeStage(db, goal, index); onClose(); }} danger />}
          <View style={{ flex: 1 }}><Button title="Save" onPress={save} disabled={!name.trim()} /></View>
        </View>
      </View>
    </Modal>
  );
}

function GoalEditor({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<Slot>('skill');
  const [stages, setStages] = useState<{ name: string; criterion: string }[]>([{ name: '', criterion: '' }]);
  const save = async () => {
    const clean = stages.filter((s) => s.name.trim());
    if (!name.trim() || clean.length === 0) { Alert.alert('Give the goal a name and at least one stage'); return; }
    await createGoal(db, { name: name.trim(), slot, stages: clean });
    onClose();
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>New goal</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Goal (e.g. Handstand)" autoFocus />
          <Text style={styles.small}>Which slot its drills take</Text>
          <View style={styles.row}>{SLOTS.map((s) => <Chip key={s} label={s} color={slotColor[s] ?? colors.inkSoft} on={slot === s} onPress={() => setSlot(s)} />)}</View>
          <Text style={styles.small}>Stages, easiest first</Text>
          {stages.map((s, i) => (
            <View key={i} style={{ gap: 4 }}>
              <TextInput style={styles.input} value={s.name} onChangeText={(v) => setStages(stages.map((x, k) => (k === i ? { ...x, name: v } : x)))} placeholder={`Stage ${i + 1} name`} />
              <TextInput style={styles.input} value={s.criterion} onChangeText={(v) => setStages(stages.map((x, k) => (k === i ? { ...x, criterion: v } : x)))} placeholder="Pass criterion" />
            </View>
          ))}
          <Pressable onPress={() => setStages([...stages, { name: '', criterion: '' }])}><Text style={styles.link}>+ Another stage</Text></Pressable>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Button title="Cancel" onPress={onClose} secondary /></View>
            <View style={{ flex: 2 }}><Button title="Create goal" onPress={save} /></View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 90 },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  card: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 14, gap: 10, borderLeftWidth: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontWeight: '800', fontSize: 17, color: colors.ink },
  progress: { flexDirection: 'row', gap: 4 },
  pip: { flex: 1, height: 5, borderRadius: 3 },
  current: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  thumb: { width: 72, height: 88, borderRadius: radius.s, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stageName: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  needs: { padding: 8, borderRadius: radius.s, gap: 6 },
  needsText: { fontWeight: '700', fontSize: 12 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  miniBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  moreBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  link: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: radius.s },
  idx: { width: 20, textAlign: 'center', fontWeight: '700', color: colors.muted },
  small: { fontSize: 12, color: colors.muted },
  tiny: { fontSize: 10, color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: 10, backgroundColor: colors.surface, fontSize: 15, color: colors.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 18, paddingBottom: 34, gap: 8, maxHeight: '85%' },
});
