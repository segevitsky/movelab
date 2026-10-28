import React, { useMemo } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc } from 'drizzle-orm';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { clipFromExercise, filterExercises } from '../../src/db/repo';
import { EQUIPMENT, PATTERNS, SLOTS } from '../../src/db/vocab';
import { useFilters } from '../../src/state/filters';
import { FigureCard } from '../../src/figure';
import { Chip, Tag } from '../../src/ui/Button';
import { colors, patternColor, radius, shadow, slotColor } from '../../src/ui/theme';
import { Rise } from '../../src/ui/motion';
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
  const cardW = Math.floor((W - 16 * 2 - 12 * (COLS - 1)) / COLS);
  const active = !!(f.pattern || f.slot || f.equipment || f.text);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.filters}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput style={styles.search} placeholder="Search name or alias" placeholderTextColor={colors.muted} value={f.text} onChangeText={(t) => f.set({ text: t })} autoCorrect={false} />
          {active && (
            <Pressable onPress={f.clear} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PATTERNS.map((p) => <Chip key={p} label={p} color={patternColor[p]} on={f.pattern === p} onPress={() => f.set({ pattern: f.pattern === p ? null : p })} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SLOTS.map((s) => <Chip key={s} label={s} color={slotColor[s] ?? colors.inkSoft} on={f.slot === s} onPress={() => f.set({ slot: f.slot === s ? null : s })} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {EQUIPMENT.map((e) => <Chip key={e} label={e} color={colors.muted} on={f.equipment === e} onPress={() => f.set({ equipment: f.equipment === e ? null : e })} />)}
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        key={COLS}
        numColumns={COLS}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: 12 }}
        renderItem={({ item, index }) => <Rise index={index}><ExerciseTile e={item} width={cardW} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })} /></Rise>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={data && data.length > 0 ? 'filter-outline' : 'albums-outline'} size={36} color={colors.muted} />
            <Text style={styles.emptyText}>{data && data.length > 0 ? 'Nothing matches these filters.' : 'Your library is empty.\nAdd an exercise, or capture a reel from the Dev tab.'}</Text>
          </View>
        }
        ListFooterComponent={<Text style={styles.count}>{rows.length} of {data?.length ?? 0} exercises</Text>}
        initialNumToRender={6}
        windowSize={5}
      />
      <Pressable style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]} onPress={() => router.push('/exercise/new')}>
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

/** Tags shown on a tile: pattern first, then slots that differ from it. */
export function tileTags(e: Pick<Exercise, 'pattern' | 'slots'>) {
  const out: { label: string; color: string }[] = [];
  if (e.pattern) out.push({ label: e.pattern, color: patternColor[e.pattern] });
  for (const s of e.slots) if (s !== e.pattern && !out.some((t) => t.label === s)) out.push({ label: s, color: slotColor[s] ?? colors.muted });
  return out.slice(0, 3);
}

function ExerciseTile({ e, width, onPress }: { e: Exercise; width: number; onPress: () => void }) {
  const clip = useMemo(() => clipFromExercise(e), [e.figure]);
  const h = Math.round(width * 1.1);
  const stripe = e.pattern ? patternColor[e.pattern] : colors.line;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { width }, shadow.card, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.stripe, { backgroundColor: stripe }]} />
      {clip ? (
        <FigureCard clip={clip} width={width} height={h} />
      ) : (
        <View style={[styles.noFigure, { width, height: h }]}>
          <Ionicons name="body-outline" size={40} color={colors.muted} />
          <Text style={styles.noFigureText}>no figure yet</Text>
        </View>
      )}
      <View style={styles.tileBody}>
        <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
        <View style={styles.tagRow}>
          {tileTags(e).map((t) => <Tag key={t.label} label={t.label} color={t.color} />)}
          {e.repSeconds ? <Text style={styles.meta}>{e.repSeconds.toFixed(1)} s/rep</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: { paddingTop: 6, paddingBottom: 8, gap: 6, backgroundColor: colors.bg },
  searchRow: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.m, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line },
  search: { flex: 1, paddingVertical: 9, fontSize: 15, color: colors.ink },
  chips: { paddingHorizontal: 16, gap: 6 },
  grid: { padding: 16, gap: 12, paddingBottom: 110 },
  tile: { borderRadius: radius.l, overflow: 'hidden', backgroundColor: colors.surface },
  stripe: { height: 4 },
  tileBody: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 6 },
  noFigure: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: 6 },
  noFigureText: { color: colors.muted, fontSize: 12 },
  name: { fontWeight: '700', fontSize: 15, color: colors.ink },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  meta: { fontSize: 11, color: colors.muted, marginLeft: 'auto' },
  count: { textAlign: 'center', color: colors.muted, fontSize: 12, paddingVertical: 10 },
  empty: { padding: 32, alignItems: 'center', gap: 10 },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...shadow.card },
});
