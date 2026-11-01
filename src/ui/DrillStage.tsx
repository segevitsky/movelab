import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Exercise } from '../db/schema';
import type { FigureClip } from '../figure/prepare';
import { FigureCard } from '../figure';
import { Tag } from './Button';
import { colors, patternColor, radius, shadow, slotColor } from './theme';

/** One drill, large and looping, with ◀ ▶ arrows that only render when there is somewhere to go. */
export function DrillStage({ e, clip, canBack, canNext, onBack, onNext, caption, children }: {
  e: Exercise; clip: FigureClip | null; canBack: boolean; canNext: boolean; onBack: () => void; onNext: () => void;
  /** small line under the name (dosage, section…) */
  caption?: string;
  children?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const W = width - 32;
  const H = Math.round(W * 1.0);
  return (
    <View style={styles.body}>
      <View style={[styles.stage, { width: W, height: H }]}>
        {clip ? <FigureCard clip={clip} width={W} height={H} /> : <Ionicons name="body-outline" size={48} color={colors.muted} />}
        {canBack && <Pressable onPress={onBack} hitSlop={12} style={[styles.arrow, { start: 6 }]}><Ionicons name="chevron-back" size={28} color={colors.ink} /></Pressable>}
        {canNext && <Pressable onPress={onNext} hitSlop={12} style={[styles.arrow, { end: 6 }]}><Ionicons name="chevron-forward" size={28} color={colors.ink} /></Pressable>}
      </View>
      <Text style={styles.name}>{e.name}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <View style={styles.tags}>
        {e.pattern && <Tag label={e.pattern} color={patternColor[e.pattern]} />}
        {e.slots.map((t) => <Tag key={t} label={t} color={slotColor[t] ?? colors.muted} />)}
      </View>
      <View style={{ flex: 1 }} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 16, paddingBottom: 28, gap: 8, alignItems: 'center' },
  stage: { borderRadius: radius.l, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  arrow: { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(246,243,238,0.85)', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  caption: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center', justifyContent: 'center' },
});
