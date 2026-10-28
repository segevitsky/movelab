import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '../../src/db';
import { insertExercise, linkSource, newId } from '../../src/db/repo';
import { EQUIPMENT, PATTERNS, SLOTS, type Equipment, type Pattern, type Slot } from '../../src/db/vocab';
import { Button, Chip } from '../../src/ui/Button';
import { colors, patternColor, radius, slotColor } from '../../src/ui/theme';

/** Manual add: name + optional link + tags. A figure needs a video → capture flow (Phase 4). */
export default function NewExercise() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name is required'); return; }
    const now = Date.now();
    const id = newId();
    try {
      await insertExercise(db, { id, name: name.trim(), aliases: [], pattern, slots, equipment, props: [], primaryMuscles: [], createdAt: now, updatedAt: now, archived: false });
      if (url.trim()) await linkSource(db, { url: url.trim(), exerciseIds: [id] });
      router.replace({ pathname: '/exercise/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Save failed', String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Archer push-up" autoFocus />
      <Text style={styles.label}>Link (optional)</Text>
      <TextInput style={styles.input} value={url} onChangeText={setUrl} placeholder="https://www.instagram.com/reel/…" autoCapitalize="none" keyboardType="url" />
      <Text style={styles.label}>Pattern</Text>
      <View style={styles.chips}>{PATTERNS.map((p) => <Chip key={p} label={p} color={patternColor[p]} on={pattern === p} onPress={() => setPattern(pattern === p ? null : p)} />)}</View>
      <Text style={styles.label}>Slots</Text>
      <View style={styles.chips}>{SLOTS.map((s) => <Chip key={s} label={s} color={slotColor[s] ?? colors.inkSoft} on={slots.includes(s)} onPress={() => setSlots(toggle(slots, s))} />)}</View>
      <Text style={styles.label}>Equipment</Text>
      <View style={styles.chips}>{EQUIPMENT.filter((x) => x !== 'none').map((q) => <Chip key={q} label={q} on={equipment.includes(q)} onPress={() => setEquipment(toggle(equipment, q))} />)}</View>
      <Text style={styles.small}>A looping figure is added when the exercise comes from a captured video (Phase 4).</Text>
      <Button title="Save" onPress={save} />
      <Button title="Cancel" onPress={() => router.back()} secondary />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, paddingBottom: 60, backgroundColor: colors.bg },
  label: { fontWeight: '700', marginTop: 10, color: colors.ink, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: 10, backgroundColor: colors.surface, fontSize: 15, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  small: { fontSize: 12, color: '#777', marginVertical: 6 },
});
