import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { deleteFramework, saveFramework } from '../../src/db/workoutRepo';
import { Button } from '../../src/ui/Button';
import { colors, radius, shadow } from '../../src/ui/theme';

export default function Frameworks() {
  const router = useRouter();
  const { data } = useLiveQuery(db.select().from(schema.framework));
  const duplicate = async (id: string) => {
    const f = data?.find((x) => x.id === id);
    if (!f) return;
    const newId = await saveFramework(db, { name: `${f.name} (copy)`, blocks: f.blocks });
    router.push({ pathname: '/frameworks/[id]', params: { id: newId } });
  };
  const create = async () => {
    const id = await saveFramework(db, { name: 'New framework', blocks: { blocks: [{ id: 'main', name: 'Main', kind: 'rounds', rounds: 3, restBetweenExercisesSec: 0, restBetweenRoundsSec: 90, slots: [{ id: 's1', tags: ['pull'] }, { id: 's2', tags: ['push'] }, { id: 's3', tags: ['legs'] }, { id: 's4', tags: ['core'] }] }] } });
    router.push({ pathname: '/frameworks/[id]', params: { id } });
  };
  return (
    <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      {(data ?? []).map((f) => (
        <Pressable key={f.id} style={[styles.card, shadow.card]} onPress={() => router.push({ pathname: '/frameworks/[id]', params: { id: f.id } })}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{f.name}{f.isPreset ? <Text style={styles.preset}>  preset</Text> : null}</Text>
            <Text style={styles.small}>{f.blocks.blocks.map((b) => `${b.name}${b.kind === 'rounds' ? ` ×${b.rounds}` : ''} (${b.slots.length})`).join(' · ')}</Text>
          </View>
          <Pressable onPress={() => duplicate(f.id)} hitSlop={8}><Ionicons name="copy-outline" size={18} color={colors.accent} /></Pressable>
          {!f.isPreset && (
            <Pressable onPress={() => Alert.alert('Delete framework?', f.name, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteFramework(db, f.id) }])} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          )}
        </Pressable>
      ))}
      <Button title="+ New framework" onPress={create} />
      <Text style={styles.small}>Presets can be edited in place or duplicated. Blocks → slots → tags → dosage → rest.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 80, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontWeight: '800', fontSize: 15, color: colors.ink },
  preset: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  small: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
