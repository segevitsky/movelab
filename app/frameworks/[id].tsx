import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../src/db';
import { getFramework, saveFramework } from '../../src/db/workoutRepo';
import type { FrameworkBlock, FrameworkBlocks, FrameworkSlot } from '../../src/db/types';
import { SLOTS, type Dosage, type Slot } from '../../src/db/vocab';
import { Button, Chip } from '../../src/ui/Button';
import { colors, radius, shadow, slotColor } from '../../src/ui/theme';

const DOSAGES: (Dosage | null)[] = [null, { type: 'time', value: 30 }, { type: 'time', value: 45 }, { type: 'time', value: 60 }, { type: 'time', value: 90 }, { type: 'reps', value: 8 }, { type: 'reps', value: 12 }];
const dosageLabel = (d: Dosage | null | undefined) => (!d ? 'card default' : d.type === 'time' ? `${d.value} s` : `${d.value} reps`);

/** Simple framework editor: blocks → slots → tags → dosage → rest (plan Phase 5). */
export default function FrameworkEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<FrameworkBlocks | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { getFramework(db, id).then((f) => { if (f) { setName(f.name); setBlocks(f.blocks); } }); }, [id]);
  if (!blocks) return <View style={{ padding: 24 }}><Text>Loading…</Text></View>;

  const setB = (next: FrameworkBlocks) => { setBlocks(next); setDirty(true); };
  const updBlock = (bi: number, patch: Partial<FrameworkBlock>) => setB({ ...blocks, blocks: blocks.blocks.map((b, i) => (i === bi ? { ...b, ...patch } : b)) });
  const updSlot = (bi: number, si: number, patch: Partial<FrameworkSlot>) => updBlock(bi, { slots: blocks.blocks[bi].slots.map((s, i) => (i === si ? { ...s, ...patch } : s)) });
  const addSlot = (bi: number) => updBlock(bi, { slots: [...blocks.blocks[bi].slots, { id: `s${Date.now().toString(36)}`, tags: ['core'] }] });
  const removeSlot = (bi: number, si: number) => updBlock(bi, { slots: blocks.blocks[bi].slots.filter((_, i) => i !== si) });
  const addBlock = () => setB({ ...blocks, blocks: [...blocks.blocks, { id: `b${Date.now().toString(36)}`, name: 'Block', kind: 'sequence', restBetweenExercisesSec: 0, slots: [{ id: 's1', tags: ['core'] }] }] });
  const removeBlock = (bi: number) => setB({ ...blocks, blocks: blocks.blocks.filter((_, i) => i !== bi) });
  const move = (bi: number, dir: -1 | 1) => { const arr = blocks.blocks.slice(); const j = bi + dir; if (j < 0 || j >= arr.length) return; [arr[bi], arr[j]] = [arr[j], arr[bi]]; setB({ ...blocks, blocks: arr }); };
  const save = async () => { await saveFramework(db, { id, name: name.trim() || 'Framework', blocks }); setDirty(false); router.back(); };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={(v) => { setName(v); setDirty(true); }} />
      {blocks.blocks.map((b, bi) => (
        <View key={b.id} style={[styles.block, shadow.card]}>
          <View style={styles.rowBetween}>
            <TextInput style={[styles.input, { flex: 1, fontWeight: '800' }]} value={b.name} onChangeText={(v) => updBlock(bi, { name: v })} />
            <Pressable onPress={() => move(bi, -1)} hitSlop={6}><Ionicons name="chevron-up" size={18} color={colors.muted} /></Pressable>
            <Pressable onPress={() => move(bi, 1)} hitSlop={6}><Ionicons name="chevron-down" size={18} color={colors.muted} /></Pressable>
            <Pressable onPress={() => Alert.alert('Remove block?', b.name, [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeBlock(bi) }])} hitSlop={6}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable>
          </View>
          <View style={styles.chips}>
            <Chip label="sequence" color={colors.inkSoft} on={b.kind === 'sequence'} onPress={() => updBlock(bi, { kind: 'sequence' })} />
            <Chip label="rounds" color={colors.inkSoft} on={b.kind === 'rounds'} onPress={() => updBlock(bi, { kind: 'rounds', rounds: b.rounds ?? 3 })} />
            {b.kind === 'rounds' && [2, 3, 4, 5].map((n) => <Chip key={n} label={`×${n}`} color={colors.accent} on={b.rounds === n} onPress={() => updBlock(bi, { rounds: n })} />)}
          </View>
          <Text style={styles.small}>Rest between exercises</Text>
          <View style={styles.chips}>{[0, 10, 20, 30, 60].map((r) => <Chip key={r} label={`${r} s`} color={colors.inkSoft} on={(b.restBetweenExercisesSec ?? 0) === r} onPress={() => updBlock(bi, { restBetweenExercisesSec: r })} />)}</View>
          {b.kind === 'rounds' && (
            <>
              <Text style={styles.small}>Rest between rounds</Text>
              <View style={styles.chips}>{[0, 60, 90, 120, 180].map((r) => <Chip key={r} label={`${r} s`} color={colors.inkSoft} on={(b.restBetweenRoundsSec ?? 0) === r} onPress={() => updBlock(bi, { restBetweenRoundsSec: r })} />)}</View>
            </>
          )}
          {b.slots.map((s, si) => (
            <View key={s.id} style={styles.slot}>
              <View style={styles.rowBetween}>
                <Text style={styles.slotTitle}>Slot {si + 1}</Text>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Text style={styles.small}>skill</Text><Switch value={!!s.isSkill} onValueChange={(v) => updSlot(bi, si, { isSkill: v })} />
                  <Text style={styles.small}>optional</Text><Switch value={!!s.optional} onValueChange={(v) => updSlot(bi, si, { optional: v })} />
                  <Pressable onPress={() => removeSlot(bi, si)} hitSlop={6}><Ionicons name="close-circle-outline" size={20} color={colors.danger} /></Pressable>
                </View>
              </View>
              <View style={styles.chips}>{SLOTS.map((t) => <Chip key={t} label={t} color={slotColor[t] ?? colors.inkSoft} on={s.tags.includes(t)} onPress={() => updSlot(bi, si, { tags: s.tags.includes(t) ? s.tags.filter((x) => x !== t) : [...s.tags, t as Slot] })} />)}</View>
              <View style={styles.chips}>{DOSAGES.map((d, k) => <Chip key={k} label={dosageLabel(d)} color={colors.muted} on={dosageLabel(s.dosage) === dosageLabel(d)} onPress={() => updSlot(bi, si, { dosage: d ?? undefined })} />)}</View>
            </View>
          ))}
          <Button title="+ Slot" onPress={() => addSlot(bi)} secondary />
        </View>
      ))}
      <Button title="+ Block" onPress={addBlock} secondary />
      <Button title={dirty ? 'Save' : 'Saved'} onPress={save} disabled={!dirty} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 80, backgroundColor: colors.bg },
  label: { fontWeight: '700', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: 10, backgroundColor: colors.surface, fontSize: 15, color: colors.ink },
  block: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 12, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  slot: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingTop: 8, gap: 6 },
  slotTitle: { fontWeight: '700', color: colors.ink },
  small: { fontSize: 12, color: colors.muted },
});
