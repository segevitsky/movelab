import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../src/db';
import { getFramework, saveFramework } from '../../src/db/workoutRepo';
import type { FrameworkBlock, FrameworkBlocks, FrameworkSlot } from '../../src/db/types';
import { SLOTS, type Dosage, type Slot } from '../../src/db/vocab';
import { Button, Chip, Tag } from '../../src/ui/Button';
import { colors, radius, shadow, slotColor } from '../../src/ui/theme';

const DOSAGES: (Dosage | null)[] = [null, { type: 'time', value: 30 }, { type: 'time', value: 45 }, { type: 'time', value: 60 }, { type: 'time', value: 90 }, { type: 'reps', value: 6 }, { type: 'reps', value: 8 }, { type: 'reps', value: 12 }];
const dosageLabel = (d: Dosage | null | undefined) => (!d ? 'card default' : d.type === 'time' ? `${d.value} s` : `${d.value} reps`);

function blockSummary(b: FrameworkBlock) {
  const parts: string[] = [];
  parts.push(b.kind === 'rounds' ? `${b.rounds ?? 1} rounds × ${b.slots.length} exercises` : `${b.slots.length} exercises, once`);
  if (b.seconds) parts.push(`${Math.round(b.seconds / 60)} min`);
  parts.push((b.restBetweenExercisesSec ?? 0) > 0 ? `${b.restBetweenExercisesSec} s between exercises` : 'no rest between exercises');
  if (b.kind === 'rounds') parts.push(`${b.restBetweenRoundsSec ?? 0} s between rounds`);
  return parts.join(' · ');
}

/** Framework editor, recipe style: blocks are cards, slots are rows, details live in small sheets. */
export default function FrameworkEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<FrameworkBlocks | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editSlot, setEditSlot] = useState<{ bi: number; si: number } | null>(null);
  const [editBlock, setEditBlock] = useState<number | null>(null);
  useEffect(() => { getFramework(db, id).then((f) => { if (f) { setName(f.name); setBlocks(f.blocks); } }); }, [id]);
  if (!blocks) return <View style={{ padding: 24 }}><Text>Loading…</Text></View>;

  const setB = (next: FrameworkBlocks) => { setBlocks(next); setDirty(true); };
  const updBlock = (bi: number, patch: Partial<FrameworkBlock>) => setB({ ...blocks, blocks: blocks.blocks.map((b, i) => (i === bi ? { ...b, ...patch } : b)) });
  const updSlot = (bi: number, si: number, patch: Partial<FrameworkSlot>) => updBlock(bi, { slots: blocks.blocks[bi].slots.map((s, i) => (i === si ? { ...s, ...patch } : s)) });
  const addSlot = (bi: number) => { const si = blocks.blocks[bi].slots.length; updBlock(bi, { slots: [...blocks.blocks[bi].slots, { id: `s${Date.now().toString(36)}`, tags: ['core'] }] }); setEditSlot({ bi, si }); };
  const removeSlot = (bi: number, si: number) => { updBlock(bi, { slots: blocks.blocks[bi].slots.filter((_, i) => i !== si) }); setEditSlot(null); };
  const addBlock = () => { setB({ ...blocks, blocks: [...blocks.blocks, { id: `b${Date.now().toString(36)}`, name: 'New block', kind: 'rounds', rounds: 3, restBetweenExercisesSec: 0, restBetweenRoundsSec: 90, slots: [{ id: 's1', tags: ['core'] }] }] }); setEditBlock(blocks.blocks.length); };
  const removeBlock = (bi: number) => { setB({ ...blocks, blocks: blocks.blocks.filter((_, i) => i !== bi) }); setEditBlock(null); };
  const move = (bi: number, dir: -1 | 1) => { const arr = blocks.blocks.slice(); const j = bi + dir; if (j < 0 || j >= arr.length) return; [arr[bi], arr[j]] = [arr[j], arr[bi]]; setB({ ...blocks, blocks: arr }); };
  const save = async () => { await saveFramework(db, { id, name: name.trim() || 'Framework', blocks }); setDirty(false); router.back(); };

  const es = editSlot ? blocks.blocks[editSlot.bi]?.slots[editSlot.si] : null;
  const eb = editBlock !== null ? blocks.blocks[editBlock] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <TextInput style={styles.name} value={name} onChangeText={(v) => { setName(v); setDirty(true); }} placeholder="Framework name" />
        <Text style={styles.hint}>A framework is the shape of a workout: blocks in order, each with slots the generator fills from your library by tag.</Text>
        {blocks.blocks.map((b, bi) => (
          <View key={b.id} style={[styles.block, shadow.card]}>
            <Pressable onPress={() => setEditBlock(bi)} style={styles.blockHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockTitle}>{b.name}</Text>
                <Text style={styles.small}>{blockSummary(b)}</Text>
              </View>
              <Ionicons name="settings-outline" size={18} color={colors.muted} />
            </Pressable>
            {b.slots.map((s, si) => (
              <Pressable key={s.id} onPress={() => setEditSlot({ bi, si })} style={styles.slotRow}>
                <Text style={styles.slotIndex}>{si + 1}</Text>
                <View style={styles.tagRow}>
                  {s.tags.map((t) => <Tag key={t} label={t} color={slotColor[t] ?? colors.muted} />)}
                  {s.isSkill && <Tag label="goal slot" color={colors.accent} />}
                  {s.optional && <Tag label="optional" />}
                </View>
                <Text style={styles.small}>{dosageLabel(s.dosage)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
            <Pressable onPress={() => addSlot(bi)} style={styles.addRow}><Ionicons name="add-circle-outline" size={18} color={colors.accent} /><Text style={styles.link}>Add a slot</Text></Pressable>
          </View>
        ))}
        <Button title="+ Add a block" onPress={addBlock} secondary />
      </ScrollView>
      <View style={styles.footer}><Button title={dirty ? 'Save framework' : 'Saved'} onPress={save} disabled={!dirty} /></View>

      {/* slot sheet */}
      <Modal visible={!!es} transparent animationType="slide" onRequestClose={() => setEditSlot(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditSlot(null)} />
        {es && editSlot && (
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Slot {editSlot.si + 1} of {blocks.blocks[editSlot.bi].name}</Text>
            <Text style={styles.label}>Which exercises can fill it (any of these tags)</Text>
            <View style={styles.chips}>{SLOTS.map((t) => <Chip key={t} label={t} color={slotColor[t] ?? colors.inkSoft} on={es.tags.includes(t)} onPress={() => updSlot(editSlot.bi, editSlot.si, { tags: es.tags.includes(t) ? es.tags.filter((x) => x !== t) : [...es.tags, t as Slot] })} />)}</View>
            <Text style={styles.label}>How much</Text>
            <View style={styles.chips}>{DOSAGES.map((d, k) => <Chip key={k} label={dosageLabel(d)} color={colors.inkSoft} on={dosageLabel(es.dosage) === dosageLabel(d)} onPress={() => updSlot(editSlot.bi, editSlot.si, { dosage: d ?? undefined })} />)}</View>
            <View style={styles.switchRow}><Text style={styles.switchLabel}>Goal slot — an active goal's current stage goes here</Text><Switch value={!!es.isSkill} onValueChange={(v) => updSlot(editSlot.bi, editSlot.si, { isSkill: v })} /></View>
            <View style={styles.switchRow}><Text style={styles.switchLabel}>Optional — dropped first when time is short</Text><Switch value={!!es.optional} onValueChange={(v) => updSlot(editSlot.bi, editSlot.si, { optional: v })} /></View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}><Button title="Remove slot" onPress={() => removeSlot(editSlot.bi, editSlot.si)} danger /></View>
              <View style={{ flex: 1 }}><Button title="Done" onPress={() => setEditSlot(null)} /></View>
            </View>
          </View>
        )}
      </Modal>

      {/* block sheet */}
      <Modal visible={!!eb} transparent animationType="slide" onRequestClose={() => setEditBlock(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditBlock(null)} />
        {eb && editBlock !== null && (
          <View style={styles.sheet}>
            <TextInput style={styles.name} value={eb.name} onChangeText={(v) => updBlock(editBlock, { name: v })} />
            <Text style={styles.label}>Structure</Text>
            <View style={styles.chips}>
              <Chip label="once, in order" color={colors.inkSoft} on={eb.kind === 'sequence'} onPress={() => updBlock(editBlock, { kind: 'sequence' })} />
              <Chip label="repeat in rounds" color={colors.inkSoft} on={eb.kind === 'rounds'} onPress={() => updBlock(editBlock, { kind: 'rounds', rounds: eb.rounds ?? 3 })} />
            </View>
            {eb.kind === 'rounds' && (<><Text style={styles.label}>Rounds</Text><View style={styles.chips}>{[2, 3, 4, 5, 6].map((n) => <Chip key={n} label={`× ${n}`} color={colors.accent} on={eb.rounds === n} onPress={() => updBlock(editBlock, { rounds: n })} />)}</View></>)}
            <Text style={styles.label}>Rest between exercises</Text>
            <View style={styles.chips}>{[0, 10, 20, 30, 60].map((r) => <Chip key={r} label={r ? `${r} s` : 'none'} color={colors.inkSoft} on={(eb.restBetweenExercisesSec ?? 0) === r} onPress={() => updBlock(editBlock, { restBetweenExercisesSec: r })} />)}</View>
            {eb.kind === 'rounds' && (<><Text style={styles.label}>Rest between rounds</Text><View style={styles.chips}>{[0, 60, 90, 120, 180].map((r) => <Chip key={r} label={r ? `${r} s` : 'none'} color={colors.inkSoft} on={(eb.restBetweenRoundsSec ?? 0) === r} onPress={() => updBlock(editBlock, { restBetweenRoundsSec: r })} />)}</View></>)}
            <View style={styles.row}>
              <Button title="Move up" onPress={() => move(editBlock, -1)} secondary />
              <Button title="Move down" onPress={() => move(editBlock, 1)} secondary />
              <Button title="Remove block" onPress={() => Alert.alert('Remove block?', eb.name, [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeBlock(editBlock) }])} danger />
            </View>
            <Button title="Done" onPress={() => setEditBlock(null)} />
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 110 },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 6 },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  block: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 12, gap: 2 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  blockTitle: { fontWeight: '800', fontSize: 16, color: colors.ink },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  slotIndex: { width: 18, textAlign: 'center', fontWeight: '700', color: colors.muted },
  tagRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  link: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  label: { fontWeight: '700', fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  switchLabel: { flex: 1, fontSize: 13, color: colors.ink },
  small: { fontSize: 12, color: colors.muted },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 18, paddingBottom: 34, gap: 8 },
  sheetTitle: { fontWeight: '800', fontSize: 16, color: colors.ink },
});
