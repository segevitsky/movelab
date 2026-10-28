import React, { useMemo } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../src/db';
import { clipFromExercise, filterExercises } from '../../src/db/repo';
import { EQUIPMENT, PATTERNS, SLOTS } from '../../src/db/vocab';
import { useFilters } from '../../src/state/filters';
import { FigureCard } from '../../src/figure';
import { Button, Chip } from '../../src/ui/Button';
import type { Exercise } from '../../src/db/schema';

const COLS = 2;

export default function Library() {
  const router = useRouter();
  const { data } = useLiveQuery(db.select().from(schema.exercise).orderBy(desc(schema.exercise.createdAt)));
  const f = useFilters();
  // deep link support: movelab:///library?pattern=push&slot=core&equipment=mat&text=...
  const params = useLocalSearchParams<{ pattern?: string; slot?: string; equipment?: string; text?: string }>();
  React.useEffect(() => {
    if (params.pattern || params.slot || params.equipment || params.text) {
      f.set({ pattern: (params.pattern as typeof f.pattern) ?? null, slot: (params.slot as typeof f.slot) ?? null, equipment: (params.equipment as typeof f.equipment) ?? null, text: params.text ?? '' });
    }
  }, [params.pattern, params.slot, params.equipment, params.text]);
  const rows = useMemo(() => filterExercises(data ?? [], { pattern: f.pattern, slot: f.slot, equipment: f.equipment, text: f.text }), [data, f.pattern, f.slot, f.equipment, f.text]);
  const W = Dimensions.get('window').width;
  const cardW = Math.floor((W - 16 * 2 - 10 * (COLS - 1)) / COLS);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.filters}>
        <TextInput style={styles.search} placeholder="Search name or alias" value={f.text} onChangeText={(t) => f.set({ text: t })} autoCorrect={false} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PATTERNS.map((p) => <Chip key={p} label={p} on={f.pattern === p} onPress={() => f.set({ pattern: f.pattern === p ? null : p })} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SLOTS.map((s) => <Chip key={s} label={`slot: ${s}`} on={f.slot === s} onPress={() => f.set({ slot: f.slot === s ? null : s })} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {EQUIPMENT.map((e) => <Chip key={e} label={e} on={f.equipment === e} onPress={() => f.set({ equipment: f.equipment === e ? null : e })} />)}
          {(f.pattern || f.slot || f.equipment || f.text) ? <Chip label="clear ✕" on={false} onPress={f.clear} /> : null}
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        key={COLS}
        numColumns={COLS}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: 10 }}
        renderItem={({ item }) => <ExerciseTile e={item} width={cardW} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })} />}
        ListEmptyComponent={
          <View style={{ padding: 24, gap: 8 }}>
            <Text style={{ color: '#666' }}>{data && data.length > 0 ? 'Nothing matches these filters.' : 'Your library is empty. Add an exercise, or capture a reel from the Dev tab.'}</Text>
          </View>
        }
        ListFooterComponent={<Text style={styles.count}>{rows.length} of {data?.length ?? 0} exercises</Text>}
        initialNumToRender={6}
        windowSize={5}
      />
      <View style={styles.fab}>
        <Button title="+ Add exercise" onPress={() => router.push('/exercise/new')} />
      </View>
    </View>
  );
}

function ExerciseTile({ e, width, onPress }: { e: Exercise; width: number; onPress: () => void }) {
  const clip = useMemo(() => clipFromExercise(e), [e.figure]);
  const h = Math.round(width * 1.15);
  return (
    <Pressable onPress={onPress} style={[styles.tile, { width }]}>
      {clip ? (
        <FigureCard clip={clip} width={width} height={h} />
      ) : (
        <View style={[styles.noFigure, { width, height: h }]}><Text style={styles.noFigureText}>no figure</Text></View>
      )}
      <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
      <Text style={styles.tags} numberOfLines={1}>{[e.pattern, ...e.slots].filter(Boolean).join(' · ') || '—'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: { paddingTop: 8, paddingBottom: 4, gap: 6, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  search: { marginHorizontal: 16, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 8, fontSize: 14, backgroundColor: '#fafafa' },
  chips: { paddingHorizontal: 16, gap: 6 },
  grid: { padding: 16, gap: 10, paddingBottom: 100 },
  tile: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', gap: 2, paddingBottom: 8 },
  noFigure: { backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  noFigureText: { color: '#999', fontSize: 12 },
  name: { fontWeight: '600', paddingHorizontal: 8, paddingTop: 6 },
  tags: { fontSize: 11, color: '#777', paddingHorizontal: 8 },
  count: { textAlign: 'center', color: '#999', fontSize: 12, paddingVertical: 10 },
  fab: { position: 'absolute', left: 16, right: 16, bottom: 16 },
});
