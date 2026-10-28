import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db, schema } from '../../src/db';
import { clipFromExercise, deleteExercise, updateExercise } from '../../src/db/repo';
import { EQUIPMENT, INTENSITY, PATTERNS, SLOTS, type Equipment, type Intensity, type Pattern, type Slot } from '../../src/db/vocab';
import { FigurePlayer } from '../../src/figure';
import { Button, Chip } from '../../src/ui/Button';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data } = useLiveQuery(db.select().from(schema.exercise).where(eq(schema.exercise.id, id)), [id]);
  const e = data?.[0];
  const { data: srcRows } = useLiveQuery(db.select().from(schema.source), []);
  const src = useMemo(() => srcRows?.find((s) => s.id === e?.sourceId), [srcRows, e?.sourceId]);
  const clip = useMemo(() => (e ? clipFromExercise(e) : null), [e?.figure]);
  const [speed, setSpeed] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [hud, setHud] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (e) { setName(e.name); setNotes(e.notes ?? ''); } }, [e?.id]);

  if (!e) return <View style={{ padding: 24 }}><Text>Not found.</Text></View>;
  const W = Dimensions.get('window').width - 32;
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = (patch: Parameters<typeof updateExercise>[2]) => updateExercise(db, e.id, patch).catch((err) => Alert.alert('Save failed', String(err)));

  return (
    <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      {clip ? (
        <FigurePlayer clip={clip} width={W} height={Math.round(W * 1.1)} speed={speed} mirror={mirror} hud={hud} style={styles.player} />
      ) : (
        <View style={[styles.noFigure, { width: W, height: Math.round(W * 0.5) }]}><Text style={{ color: '#999' }}>No figure (manual exercise). Add a video in Phase 4.</Text></View>
      )}
      {clip && (
        <View style={styles.row}>
          <Button title={`speed ${speed}×`} onPress={() => setSpeed(speed === 1 ? 0.5 : 1)} secondary />
          <View style={styles.toggle}><Switch value={mirror} onValueChange={setMirror} /><Text style={styles.small}>mirror</Text></View>
          <View style={styles.toggle}><Switch value={hud} onValueChange={setHud} /><Text style={styles.small}>angles</Text></View>
        </View>
      )}

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} onBlur={() => name.trim() && name !== e.name && save({ name: name.trim() })} />

      <Text style={styles.label}>Pattern</Text>
      <View style={styles.chips}>{PATTERNS.map((p) => <Chip key={p} label={p} on={e.pattern === p} onPress={() => save({ pattern: e.pattern === p ? null : (p as Pattern) })} />)}</View>
      <Text style={styles.label}>Slots</Text>
      <View style={styles.chips}>{SLOTS.map((s) => <Chip key={s} label={s} on={e.slots.includes(s)} onPress={() => save({ slots: toggle<Slot>(e.slots, s) })} />)}</View>
      <Text style={styles.label}>Equipment</Text>
      <View style={styles.chips}>{EQUIPMENT.filter((x) => x !== 'none').map((q) => <Chip key={q} label={q} on={e.equipment.includes(q)} onPress={() => save({ equipment: toggle<Equipment>(e.equipment, q) })} />)}</View>
      <Text style={styles.label}>Intensity</Text>
      <View style={styles.chips}>{INTENSITY.map((i) => <Chip key={i} label={i} on={e.intensity === i} onPress={() => save({ intensity: e.intensity === i ? null : (i as Intensity) })} />)}</View>

      <Text style={styles.label}>Default dosage</Text>
      <View style={styles.chips}>
        {[{ type: 'reps', value: 8 }, { type: 'reps', value: 12 }, { type: 'time', value: 30 }, { type: 'time', value: 45 }, { type: 'time', value: 60 }].map((d) => {
          const on = e.dosageDefault?.type === d.type && e.dosageDefault?.value === d.value;
          return <Chip key={`${d.type}${d.value}`} label={d.type === 'reps' ? `${d.value} reps` : `${d.value} s`} on={on} onPress={() => save({ dosageDefault: on ? null : (d as { type: 'reps' | 'time'; value: number }) })} />;
        })}
      </View>
      {e.repSeconds ? <Text style={styles.small}>measured rep ≈ {e.repSeconds.toFixed(1)} s</Text> : null}

      <Text style={styles.label}>Notes</Text>
      <TextInput style={[styles.input, { minHeight: 60 }]} value={notes} onChangeText={setNotes} multiline onBlur={() => notes !== (e.notes ?? '') && save({ notes })} />

      {src && (
        <>
          <Text style={styles.label}>Source</Text>
          <Text style={styles.link} onPress={() => Linking.openURL(src.url)}>{src.coach ? `@${src.coach} · ` : ''}{src.url}</Text>
        </>
      )}
      <Text style={styles.small}>
        {e.figureFrames ? `${e.figureFrames} frames @ ${e.figureFps?.toFixed(1)} fps · loop ${e.loopStart}–${e.loopEnd} · ` : ''}
        created {new Date(e.createdAt).toLocaleDateString()}
      </Text>

      <View style={styles.row}>
        <Button title={e.archived ? 'Unarchive' : 'Archive'} onPress={() => save({ archived: !e.archived })} secondary />
        <Button
          title="Delete"
          danger
          onPress={() => Alert.alert('Delete exercise?', e.name, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteExercise(db, e.id).then(() => router.back()) }])}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, paddingBottom: 80 },
  player: { borderRadius: 14 },
  noFigure: { backgroundColor: '#eee', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontWeight: '700', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  small: { fontSize: 12, color: '#777' },
  link: { color: '#1a5fb4', fontSize: 13 },
});
