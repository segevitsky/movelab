import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, PanResponder, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { desc } from 'drizzle-orm';
import { Ionicons } from '@expo/vector-icons';
import { db, schema } from '../../src/db';
import { clipFromExercise, filterExercises } from '../../src/db/repo';
import { EQUIPMENT, PATTERNS, SLOTS, type Equipment, type Pattern, type Slot } from '../../src/db/vocab';
import { useFilters } from '../../src/state/filters';
import { FigureCard, FigureStill } from '../../src/figure';
import { Chip, Tag } from '../../src/ui/Button';
import { CreatorName } from '../../src/ui/CreatorName';
import { Empty, OptionRow, Screen, Sheet, TitleBar } from '../../src/ui/primitives';
import { DraggableList } from '../../src/ui/DraggableList';
import { Button, IconButton } from '../../src/ui/Button';
import { colors, hit, patternColor, radius, slotColor, space, type } from '../../src/ui/theme';
import { Rise } from '../../src/ui/motion';
import type { Exercise } from '../../src/db/schema';

const COLS = 2;
/** Phase 2 budget: at most this many figures loop at once; the rest show their loop-start frame. */
const MAX_LIVE = 6;

type SheetKind = 'pattern' | 'slot' | 'equipment' | null;

export default function Library() {
  const router = useRouter();
  const { width: W } = useWindowDimensions();
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
  const cardW = Math.floor((W - space.l * 2 - space.m * (COLS - 1)) / COLS);
  const active = !!(f.pattern || f.slot || f.equipment || f.text);
  const [sheet, setSheet] = useState<SheetKind>(null);
  // select mode: long-press a card → tick cards → Build workout (order = the tray, drag to reorder)
  const [selected, setSelected] = useState<string[] | null>(null);
  const toggleSelect = (id: string) => setSelected((sel) => { const cur = sel ?? []; return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; });
  const selectedRows = useMemo(() => (selected ?? []).map((id) => (data ?? []).find((e) => e.id === id)).filter((e): e is Exercise => !!e), [selected, data]);

  // which tiles loop: the first MAX_LIVE that are ≥ 50 % visible
  const [live, setLive] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 80 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: Exercise }[] }) => {
    setLive(new Set(viewableItems.slice(0, MAX_LIVE).map((v) => v.item.id)));
  }).current;

  const total = data?.length ?? 0;
  const countText = active ? `${rows.length} of ${total}` : `${total} ${total === 1 ? 'exercise' : 'exercises'}`;

  // swipe the tray down to cancel the selection (native sheet feel)
  const dismiss = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 16 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 16 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderRelease: (_, g) => { if (g.dy > 48 || g.vy > 0.8) setSelected(null); },
    }),
  ).current;
  const tray = selected ? (
    <View style={styles.tray} {...dismiss.panHandlers}>
      <View style={styles.grabber} />
      <View style={styles.trayHead}>
        <Text style={styles.trayTitle}>{selected.length} picked · drag to order · swipe down to cancel</Text>
        <IconButton icon="close" size={36} onPress={() => setSelected(null)} />
      </View>
      <DraggableList
        horizontal
        data={selectedRows}
        keyOf={(e) => e.id}
        rowHeight={56}
        gap={6}
        onReorder={(f, t) => setSelected((sel) => { const l = [...(sel ?? [])]; const [m] = l.splice(f, 1); l.splice(t, 0, m); return l; })}
        render={(e, _i, dragging, lift) => {
          const clip = clipFromExercise(e);
          return (
            <Pressable onLongPress={lift} onPress={() => toggleSelect(e.id)} delayLongPress={180} style={[styles.trayThumb, dragging && { borderColor: colors.accent }]}>
              {clip ? <FigureStill clip={clip} width={56} height={56} /> : <Ionicons name="body-outline" size={20} color={colors.muted} />}
            </Pressable>
          );
        }}
      />
      <Button title={`Build workout · ${selected.length}`} size="l" icon="hammer-outline" disabled={selected.length === 0} onPress={() => { const ids = selected.join(','); setSelected(null); router.push({ pathname: '/build', params: { ids } }); }} />
    </View>
  ) : undefined;

  return (
    <Screen footer={tray}>
      <TitleBar title="Library" brand trailing={<Text style={styles.count}>{countText}</Text>} />
      <View style={styles.filters}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput style={styles.search} placeholder="Search name or alias" placeholderTextColor={colors.muted} value={f.text} onChangeText={(t) => f.set({ text: t })} autoCorrect={false} returnKeyType="search" />
          {!!f.text && (
            <Pressable onPress={() => f.set({ text: '' })} hitSlop={10}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>
          )}
        </View>
        <View style={styles.chips}>
          <Chip label="All" on={!active} onPress={f.clear} />
          <Chip label={f.pattern ?? 'pattern'} on={!!f.pattern} color={f.pattern ? patternColor[f.pattern] : undefined} icon={f.pattern ? undefined : 'chevron-down'} onPress={() => setSheet('pattern')} />
          <Chip label={f.slot ?? 'slot'} on={!!f.slot} color={f.slot ? slotColor[f.slot] ?? colors.accent : undefined} icon={f.slot ? undefined : 'chevron-down'} onPress={() => setSheet('slot')} />
          <Chip label={f.equipment ?? 'gear'} on={!!f.equipment} icon={f.equipment ? undefined : 'chevron-down'} onPress={() => setSheet('equipment')} />
        </View>
      </View>
      <FlatList
        data={rows}
        key={COLS}
        numColumns={COLS}
        keyExtractor={(e) => e.id}
        contentContainerStyle={[styles.grid, selected && { paddingBottom: 230 }]}
        columnWrapperStyle={{ gap: space.m }}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item, index }) => (
          <Rise index={index}>
            <ExerciseTile e={item} width={cardW} live={live.has(item.id)} selected={selected ? selected.includes(item.id) : null} onLongPress={() => { if (!selected) setSelected([item.id]); }} onPress={() => (selected ? toggleSelect(item.id) : router.push({ pathname: '/exercise/[id]', params: { id: item.id } }))} />
          </Rise>
        )}
        ListEmptyComponent={
          <Empty icon={total > 0 ? 'filter-outline' : 'albums-outline'} text={total > 0 ? 'Nothing matches these filters.' : 'Your library is empty. Share a reel from Instagram, or add an exercise.'} />
        }
        initialNumToRender={6}
        windowSize={5}
        keyboardDismissMode="on-drag"
      />
      {!selected && (
        <Pressable style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85, transform: [{ scale: 0.94 }] }]} onPress={() => router.push('/exercise/new')} accessibilityLabel="Add exercise">
          <Ionicons name="add" size={28} color={colors.onAccent} />
        </Pressable>
      )}

      <Sheet visible={sheet === 'pattern'} onClose={() => setSheet(null)} title="Movement pattern">
        <OptionRow label="Any" selected={!f.pattern} onPress={() => { f.set({ pattern: null }); setSheet(null); }} />
        {PATTERNS.map((p: Pattern) => <OptionRow key={p} label={p} color={patternColor[p]} selected={f.pattern === p} onPress={() => { f.set({ pattern: p }); setSheet(null); }} />)}
      </Sheet>
      <Sheet visible={sheet === 'slot'} onClose={() => setSheet(null)} title="Workout slot">
        <OptionRow label="Any" selected={!f.slot} onPress={() => { f.set({ slot: null }); setSheet(null); }} />
        {SLOTS.map((s: Slot) => <OptionRow key={s} label={s} color={slotColor[s] ?? colors.muted} selected={f.slot === s} onPress={() => { f.set({ slot: s }); setSheet(null); }} />)}
      </Sheet>
      <Sheet visible={sheet === 'equipment'} onClose={() => setSheet(null)} title="Equipment">
        <OptionRow label="Any" selected={!f.equipment} onPress={() => { f.set({ equipment: null }); setSheet(null); }} />
        {EQUIPMENT.map((e: Equipment) => <OptionRow key={e} label={e} selected={f.equipment === e} onPress={() => { f.set({ equipment: e }); setSheet(null); }} />)}
      </Sheet>
    </Screen>
  );
}

/** Tags shown on a tile: the pattern, then the first slot that differs from it. */
export function tileTags(e: Pick<Exercise, 'pattern' | 'slots'>) {
  const out: { label: string; color: string }[] = [];
  if (e.pattern) out.push({ label: e.pattern, color: patternColor[e.pattern] });
  for (const s of e.slots) if (s !== e.pattern && !out.some((t) => t.label === s)) out.push({ label: s, color: slotColor[s] ?? colors.muted });
  return out.slice(0, 3);
}

/** The card is the figure: paper stage with a 3 pt pattern stripe on the start edge, one name line, one tag. */
const ExerciseTile = React.memo(function ExerciseTile({ e, width, live, onPress, onLongPress, selected }: { e: Exercise; width: number; live: boolean; onPress: () => void; onLongPress?: () => void; /** null = not in select mode */ selected: boolean | null }) {
  const clip = useMemo(() => clipFromExercise(e), [e.figure, e.scene]);
  const h = Math.round(width * 1.1);
  const stripe = e.pattern ? patternColor[e.pattern] : colors.line;
  const tags = tileTags(e);
  const second = tags[1]?.label;
  const Fig = live ? FigureCard : FigureStill;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={260} style={({ pressed }) => [styles.tile, { width }, selected === true && styles.tileSelected, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.stage, { width, height: h }]}>
        {clip ? (
          <Fig clip={clip} width={width} height={h} />
        ) : (
          <View style={[styles.noFigure, { width, height: h }]}>
            <Ionicons name="body-outline" size={40} color={colors.muted} />
            <Text style={styles.noFigureText}>no figure yet</Text>
          </View>
        )}
        <View style={[styles.stripe, { backgroundColor: stripe }]} />
        {selected !== null && <View style={[styles.check, selected && { backgroundColor: colors.accentDeep, borderColor: colors.accentDeep }]}>{selected ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : null}</View>}
      </View>
      <View style={styles.tileBody}>
        <CreatorName name={e.name} style={styles.name} numberOfLines={1} />
        <View style={styles.tagRow}>
          {tags[0] ? <Tag label={tags[0].label} color={tags[0].color} /> : null}
          {second ? <Text style={styles.meta} numberOfLines={1}>{second}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  count: { ...type.caption, color: colors.muted },
  filters: { paddingHorizontal: space.l, paddingBottom: space.s, gap: space.s },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: colors.surface, borderRadius: radius.m, paddingHorizontal: space.m, minHeight: hit.min, borderWidth: 1, borderColor: colors.line },
  search: { flex: 1, paddingVertical: 10, ...type.body, color: colors.ink },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  grid: { paddingHorizontal: space.l, paddingTop: space.xs, gap: space.m, paddingBottom: 110 },
  tile: { borderRadius: radius.l, overflow: 'hidden', backgroundColor: colors.surface },
  stage: { overflow: 'hidden' },
  stripe: { position: 'absolute', start: 0, top: 0, bottom: 0, width: 3 },
  tileBody: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.m, gap: 4 },
  noFigure: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: 6 },
  noFigureText: { ...type.caption, color: colors.muted },
  name: { ...type.bodyStrong, color: colors.ink },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...type.caption, color: colors.muted, flexShrink: 1 },
  tileSelected: { borderWidth: 2, borderColor: colors.accent },
  check: { position: 'absolute', top: 8, end: 8, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(28,32,44,0.5)', backgroundColor: 'rgba(246,243,238,0.85)', alignItems: 'center', justifyContent: 'center' },
  tray: { gap: space.s },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 2 },
  trayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  trayTitle: { ...type.caption, color: colors.muted, flex: 1 },
  trayThumb: { width: 56, height: 56, borderRadius: radius.s, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', end: 18, bottom: 18, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentDeep, alignItems: 'center', justifyContent: 'center' },
});
