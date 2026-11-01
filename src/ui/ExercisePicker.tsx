import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Exercise } from '../db/schema';
import { useClipCache } from './useClipCache';
import type { Slot } from '../db/vocab';
import { FigureStill } from '../figure';
import { Button, Tag } from './Button';
import { DrillPager } from './DrillPager';
import { DrillStage } from './DrillStage';
import { colors, patternColor, radius, slotColor, tint } from './theme';

type Props = {
  visible: boolean;
  title: string;
  exercises: Exercise[];
  /** slots this pick is for; matching cards are listed first */
  preferTags?: Slot[];
  onPick: (e: Exercise) => void;
  onClose: () => void;
  /** exercise ids already used in the same section (duplicates are warned about, not forbidden) */
  inSectionIds?: string[];
};

/**
 * Pick an exercise from the library. A plain list (tap a row to use it); the 👁 on a row opens that drill
 * large and looping, with ◀ ▶ / swipe to browse the same list and "Use this drill".
 */
export function ExercisePicker({ visible, title, exercises, preferTags = [], onPick, onClose, inSectionIds = [] }: Props) {
  const [text, setText] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);
  useEffect(() => { if (visible) { setText(''); setViewId(null); } }, [visible]);
  const clips = useClipCache(exercises);
  const inSection = useMemo(() => new Set(inSectionIds), [inSectionIds.join(',')]);
  const rows = useMemo(() => {
    const all = exercises.filter((e) => !e.archived && (!text || e.name.toLowerCase().includes(text.toLowerCase())));
    const fits = all.filter((e) => preferTags.some((t) => e.slots.includes(t)));
    const rest = all.filter((e) => !fits.includes(e));
    return [...fits.map((e) => ({ e, fits: true })), ...rest.map((e) => ({ e, fits: preferTags.length === 0 }))];
  }, [exercises, text, preferTags.join(',')]);

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
          {viewed ? <Pressable onPress={() => setViewId(null)} hitSlop={10} style={styles.headBtn}><Ionicons name="chevron-back" size={24} color={colors.ink} /></Pressable> : null}
          <Text style={styles.title} numberOfLines={1}>{viewed ? `${viewIndex + 1} / ${rows.length}` : title}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.headBtn}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
        </View>

        {viewed ? (
          <DrillPager
            items={rows}
            index={viewIndex}
            onIndex={(i) => { const r = rows[i]; if (r) setViewId(r.e.id); }}
            keyOf={(r) => r.e.id}
            render={(r, i, active) => (
              <DrillStage e={r.e} clip={clips.get(r.e)} canBack={i > 0} canNext={i < rows.length - 1} onBack={() => go(-1)} onNext={() => go(1)} active={active}>
                {inSection.has(r.e.id) && (
                  <View style={[styles.notice, { backgroundColor: tint(colors.danger, 0.12) }]}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                    <Text style={[styles.small, { color: colors.danger, flex: 1 }]}>Already in this section.</Text>
                  </View>
                )}
                <View style={{ gap: 6, alignSelf: 'stretch' }}>
                  <Button title={inSection.has(r.e.id) ? 'Use this drill anyway' : 'Use this drill'} onPress={() => pick(r.e)} secondary={inSection.has(r.e.id)} />
                  <Text style={[styles.small, { textAlign: 'center' }]}>swipe or ◀ ▶ to see the next one in the list</Text>
                </View>
              </DrillStage>
            )}
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
                const dup = inSection.has(r.e.id);
                return (
                  <Pressable onPress={() => pick(r.e)} style={[styles.row, !r.fits && { opacity: 0.7 }]}>
                    <Pressable onPress={() => setViewId(r.e.id)} hitSlop={6} style={styles.thumb}>
                      {clip ? <FigureStill clip={clip} width={64} height={78} /> : <Ionicons name="body-outline" size={22} color={colors.muted} />}
                      <View style={styles.eye}><Ionicons name="eye-outline" size={13} color="#fff" /></View>
                    </Pressable>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.name}>{r.e.name}</Text>
                      <View style={styles.tags}>
                        {r.e.pattern && <Tag label={r.e.pattern} color={patternColor[r.e.pattern]} />}
                        {r.e.slots.slice(0, 3).map((t) => <Tag key={t} label={t} color={slotColor[t] ?? colors.muted} />)}
                        {dup && <Text style={[styles.small, { color: colors.danger }]}>· already in this section</Text>}
                        {!r.fits && !dup && <Text style={styles.small}>· other</Text>}
                      </View>
                    </View>
                    <Ionicons name="add-circle" size={26} color={dup ? colors.muted : colors.accent} />
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={[styles.small, { padding: 16 }]}>No exercises yet — capture a reel first.</Text>}
              ListHeaderComponent={<Text style={[styles.small, { marginBottom: 4 }]}>tap a row to use it · tap the thumbnail to watch it first</Text>}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 10, minHeight: 36 },
  headBtn: { padding: 4 },
  title: { flex: 1, fontWeight: '800', fontSize: 16, color: colors.ink },
  search: { margin: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: 10, backgroundColor: colors.surface, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.m, padding: 8 },
  thumb: { width: 64, height: 78, borderRadius: radius.s, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  eye: { position: 'absolute', bottom: 3, end: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(28,32,44,0.6)', alignItems: 'center', justifyContent: 'center' },
  name: { fontWeight: '700', color: colors.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  small: { fontSize: 12, color: colors.muted },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: radius.m, alignSelf: 'stretch' },
});
