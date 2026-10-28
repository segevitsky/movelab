import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Exercise } from '../db/schema';
import { clipFromExercise } from '../db/repo';
import type { Slot } from '../db/vocab';
import { FigureStill } from '../figure';
import { Tag } from './Button';
import { colors, patternColor, radius, slotColor } from './theme';

/** Pick an exercise from the library; cards matching `preferTags` are listed first. */
export function ExercisePicker({ visible, title, exercises, preferTags = [], onPick, onClose }: { visible: boolean; title: string; exercises: Exercise[]; preferTags?: Slot[]; onPick: (e: Exercise) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const rows = useMemo(() => {
    const all = exercises.filter((e) => !e.archived && (!text || e.name.toLowerCase().includes(text.toLowerCase())));
    const fits = all.filter((e) => preferTags.some((t) => e.slots.includes(t)));
    const rest = all.filter((e) => !fits.includes(e));
    return [...fits.map((e) => ({ e, fits: true })), ...rest.map((e) => ({ e, fits: preferTags.length === 0 }))];
  }, [exercises, text, preferTags.join(',')]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
        </View>
        <TextInput style={styles.search} placeholder="Search" placeholderTextColor={colors.muted} value={text} onChangeText={setText} autoCorrect={false} />
        <FlatList
          data={rows}
          keyExtractor={(r) => r.e.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 60 }}
          renderItem={({ item: r }) => {
            const clip = clipFromExercise(r.e);
            return (
              <Pressable onPress={() => onPick(r.e)} style={[styles.row, !r.fits && { opacity: 0.7 }]}>
                <View style={styles.thumb}>{clip ? <FigureStill clip={clip} width={64} height={78} /> : <Ionicons name="body-outline" size={22} color={colors.muted} />}</View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.name}>{r.e.name}</Text>
                  <View style={styles.tags}>
                    {r.e.pattern && <Tag label={r.e.pattern} color={patternColor[r.e.pattern]} />}
                    {r.e.slots.slice(0, 3).map((t) => <Tag key={t} label={t} color={slotColor[t] ?? colors.muted} />)}
                    {!r.fits && <Text style={styles.small}>· other</Text>}
                  </View>
                </View>
                <Ionicons name="add-circle" size={24} color={colors.accent} />
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={[styles.small, { padding: 16 }]}>No exercises yet — capture a reel first.</Text>}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 10 },
  title: { flex: 1, fontWeight: '800', fontSize: 16, color: colors.ink },
  search: { margin: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: 10, backgroundColor: colors.surface, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.m, padding: 8 },
  thumb: { width: 64, height: 78, borderRadius: radius.s, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  name: { fontWeight: '700', color: colors.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  small: { fontSize: 12, color: colors.muted },
});
