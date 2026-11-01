import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Exercise } from '../db/schema';
import { useClipCache } from './useClipCache';
import type { Slot } from '../db/vocab';
import { FigureCard, FigureStill } from '../figure';
import { Button, Tag } from './Button';
import { SwipeNav } from './SwipeNav';
import { colors, patternColor, radius, shadow, slotColor, tint } from './theme';

export type PickerAction = { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; destructive?: boolean };

type Props = {
  visible: boolean;
  title: string;
  exercises: Exercise[];
  /** slots this pick is for; matching cards are listed first */
  preferTags?: Slot[];
  onPick: (e: Exercise) => void;
  onClose: () => void;
  /** the drill currently in this slot — opens straight in view mode on it */
  currentId?: string;
  /** exercise ids already used elsewhere in the same section (duplicates are warned about, not forbidden) */
  inSectionIds?: string[];
  /** actions for the current drill, shown in view mode (lock, open card, remove…) */
  actions?: PickerAction[];
};

/**
 * Pick an exercise from the library. Two modes:
 *  - list: search + rows (tap a row to view it, tap ⊕ to use it straight away)
 *  - view: one drill large and looping; ◀ ▶ or swipe to browse the same list; "Use this drill" to pick.
 */
export function ExercisePicker({ visible, title, exercises, preferTags = [], onPick, onClose, currentId, inSectionIds = [], actions = [] }: Props) {
  const [text, setText] = useState('');
  const [viewId, setViewId] = useState<string | null>(currentId ?? null);
  useEffect(() => { if (visible) { setText(''); setViewId(currentId ?? null); } }, [visible, currentId]);
  const clips = useClipCache(exercises);
  const inSection = useMemo(() => new Set(inSectionIds), [inSectionIds.join(',')]);
  const rows = useMemo(() => {
    const all = exercises.filter((e) => !e.archived && (!text || e.name.toLowerCase().includes(text.toLowerCase())));
    const cur = all.filter((e) => e.id === currentId);
    const fits = all.filter((e) => e.id !== currentId && preferTags.some((t) => e.slots.includes(t)));
    const rest = all.filter((e) => e.id !== currentId && !fits.includes(e));
    return [...cur.map((e) => ({ e, fits: true })), ...fits.map((e) => ({ e, fits: true })), ...rest.map((e) => ({ e, fits: preferTags.length === 0 }))];
  }, [exercises, text, preferTags.join(','), currentId]);

  const pick = (e: Exercise) => {
    if (inSection.has(e.id)) {
      Alert.alert('Already in this section', `${e.name} is already part of this section. Add it a second time anyway?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add anyway', onPress: () => onPick(e) },
      ]);
      return;
    }
    onPick(e);
  };

  const viewIndex = viewId ? rows.findIndex((r) => r.e.id === viewId) : -1;
  const viewed = viewIndex >= 0 ? rows[viewIndex].e : null;
  const go = (dir: 1 | -1) => {
    const next = rows[viewIndex + dir];
    if (!next) return;
    Haptics.selectionAsync().catch(() => {});
    setViewId(next.e.id);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.head}>
          {viewed ? (
            <Pressable onPress={() => setViewId(null)} hitSlop={10} style={styles.headBtn}><Ionicons name="list-outline" size={22} color={colors.ink} /></Pressable>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>{viewed ? `${viewIndex + 1} / ${rows.length}` : title}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.headBtn}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
        </View>

        {viewed ? (
          <DrillView
            e={viewed}
            clip={clips.get(viewed)}
            isCurrent={viewed.id === currentId}
            duplicate={inSection.has(viewed.id)}
            canBack={viewIndex > 0}
            canNext={viewIndex < rows.length - 1}
            onBack={() => go(-1)}
            onNext={() => go(1)}
            onUse={() => pick(viewed)}
            actions={actions}
          />
        ) : (
          <>
            <TextInput style={styles.search} placeholder="Search" placeholderTextColor={colors.muted} value={text} onChangeText={setText} autoCorrect={false} />
            <FlatList
              data={rows}
              keyExtractor={(r) => r.e.id}
              contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 60 }}
              renderItem={({ item: r }) => {
                const clip = clips.get(r.e);
                const isCurrent = r.e.id === currentId;
                const dup = inSection.has(r.e.id);
                return (
                  <Pressable onPress={() => setViewId(r.e.id)} style={[styles.row, !r.fits && { opacity: 0.7 }, isCurrent && styles.rowCurrent]}>
                    <View style={styles.thumb}>{clip ? <FigureStill clip={clip} width={64} height={78} /> : <Ionicons name="body-outline" size={22} color={colors.muted} />}</View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.name}>{r.e.name}</Text>
                      <View style={styles.tags}>
                        {r.e.pattern && <Tag label={r.e.pattern} color={patternColor[r.e.pattern]} />}
                        {r.e.slots.slice(0, 3).map((t) => <Tag key={t} label={t} color={slotColor[t] ?? colors.muted} />)}
                        {isCurrent && <Text style={styles.small}>· current</Text>}
                        {dup && <Text style={[styles.small, { color: colors.danger }]}>· already in this section</Text>}
                        {!r.fits && !dup && <Text style={styles.small}>· other</Text>}
                      </View>
                    </View>
                    {!isCurrent && (
                      <Pressable onPress={() => pick(r.e)} hitSlop={10}><Ionicons name="add-circle" size={26} color={dup ? colors.muted : colors.accent} /></Pressable>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={[styles.small, { padding: 16 }]}>No exercises yet — capture a reel first.</Text>}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

function DrillView({ e, clip, isCurrent, duplicate, canBack, canNext, onBack, onNext, onUse, actions }: {
  e: Exercise; clip: ReturnType<ReturnType<typeof useClipCache>['get']>; isCurrent: boolean; duplicate: boolean;
  canBack: boolean; canNext: boolean; onBack: () => void; onNext: () => void; onUse: () => void; actions: PickerAction[];
}) {
  const { width } = useWindowDimensions();
  const W = width - 32;
  const H = Math.round(W * 1.0);
  return (
    <SwipeNav onNext={() => canNext && onNext()} onBack={() => canBack && onBack()} style={{ flex: 1 }}>
      <View style={styles.viewBody}>
        <View style={[styles.stage, { width: W, height: H }]}>
          {clip ? <FigureCard clip={clip} width={W} height={H} /> : <Ionicons name="body-outline" size={48} color={colors.muted} />}
          {canBack && (
            <Pressable onPress={onBack} hitSlop={12} style={[styles.arrow, { start: 6 }]}><Ionicons name="chevron-back" size={28} color={colors.ink} /></Pressable>
          )}
          {canNext && (
            <Pressable onPress={onNext} hitSlop={12} style={[styles.arrow, { end: 6 }]}><Ionicons name="chevron-forward" size={28} color={colors.ink} /></Pressable>
          )}
        </View>
        <Text style={styles.viewName}>{e.name}</Text>
        <View style={[styles.tags, { justifyContent: 'center' }]}>
          {e.pattern && <Tag label={e.pattern} color={patternColor[e.pattern]} />}
          {e.slots.map((t) => <Tag key={t} label={t} color={slotColor[t] ?? colors.muted} />)}
          {e.repSeconds ? <Text style={styles.small}>· rep ≈ {e.repSeconds.toFixed(1)} s</Text> : null}
        </View>
        {duplicate && !isCurrent && (
          <View style={[styles.notice, { backgroundColor: tint(colors.danger, 0.12) }]}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={[styles.small, { color: colors.danger, flex: 1 }]}>Already in this section — pick something else, or add it anyway.</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {isCurrent ? (
          <View style={styles.actions}>
            {actions.map((a) => (
              <Pressable key={a.label} onPress={() => { Haptics.selectionAsync().catch(() => {}); a.onPress(); }} style={[styles.action, a.destructive && { backgroundColor: tint(colors.danger, 0.12) }]}>
                <Ionicons name={a.icon} size={20} color={a.destructive ? colors.danger : colors.ink} />
                <Text style={[styles.actionText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
              </Pressable>
            ))}
            <Text style={[styles.small, { width: '100%', textAlign: 'center' }]}>this is the current drill · swipe or ◀ ▶ to browse others</Text>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Button title={duplicate ? 'Use this drill anyway' : 'Use this drill'} onPress={onUse} secondary={duplicate} />
            <Text style={[styles.small, { textAlign: 'center' }]}>swipe or ◀ ▶ to browse</Text>
          </View>
        )}
      </View>
    </SwipeNav>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 10, minHeight: 36 },
  headBtn: { padding: 4 },
  title: { flex: 1, fontWeight: '800', fontSize: 16, color: colors.ink },
  search: { margin: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: 10, backgroundColor: colors.surface, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.m, padding: 8 },
  rowCurrent: { borderWidth: 1.5, borderColor: colors.accent },
  thumb: { width: 64, height: 78, borderRadius: radius.s, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  name: { fontWeight: '700', color: colors.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  small: { fontSize: 12, color: colors.muted },
  viewBody: { flex: 1, padding: 16, paddingBottom: 28, gap: 10, alignItems: 'center' },
  stage: { borderRadius: radius.l, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  arrow: { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(246,243,238,0.85)', alignItems: 'center', justifyContent: 'center' },
  viewName: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: radius.m, alignSelf: 'stretch' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.m, backgroundColor: colors.surface, ...shadow.card },
  actionText: { fontWeight: '700', color: colors.ink, fontSize: 14 },
});
