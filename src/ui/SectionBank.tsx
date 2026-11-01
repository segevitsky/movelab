import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../db';
import type { Exercise, SectionPreset } from '../db/schema';
import { deleteSectionPreset, listSectionPresets } from '../db/sectionRepo';
import { Empty, Sheet } from './primitives';
import { colors, hit, radius, space, type } from './theme';

/** Pick a saved section to drop into a workout section (long-press / trash to delete). */
export function SectionBankSheet({ visible, onClose, onPick, exercisesById, title = 'Replace from saved sections' }: {
  visible: boolean; onClose: () => void; onPick: (preset: SectionPreset) => void; exercisesById: Map<string, Exercise>; title?: string;
}) {
  const [rows, setRows] = useState<SectionPreset[] | null>(null);
  const load = () => listSectionPresets(db).then(setRows).catch(() => setRows([]));
  useEffect(() => { if (visible) load(); }, [visible]);
  const remove = (p: SectionPreset) => Alert.alert('Delete saved section?', p.name, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteSectionPreset(db, p.id).then(load) }]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {rows && rows.length === 0 ? <Empty icon="bookmark-outline" text="No saved sections yet. On a workout, tap the bookmark next to a section to save its drills." /> : null}
      {(rows ?? []).map((p) => (
        <Pressable key={p.id} onPress={() => onPick(p)} onLongPress={() => remove(p)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.meta} numberOfLines={2}>{p.drills.map((d) => exercisesById.get(d.exerciseId)?.name.replace(/\s*[·\-–]\s*@.*$/, '') ?? '?').join(' · ')}</Text>
          </View>
          <Pressable onPress={() => remove(p)} hitSlop={8} style={styles.trash} accessibilityLabel="Delete"><Ionicons name="trash-outline" size={18} color={colors.muted} /></Pressable>
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: hit.min + 8, paddingHorizontal: space.s, paddingVertical: space.s, borderRadius: radius.m },
  name: { ...type.bodyStrong, color: colors.ink },
  meta: { ...type.caption, color: colors.muted },
  trash: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
