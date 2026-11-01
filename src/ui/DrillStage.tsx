import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Exercise } from '../db/schema';
import type { FigureClip } from '../figure/prepare';
import { FigureCard, FigureStill } from '../figure';
import { Tag } from './Button';
import { colors, patternColor, radius, shadow, slotColor } from './theme';

/** One drill, large and looping, with ◀ ▶ arrows that only render when there is somewhere to go. */
export function DrillStage({ e, clip, canBack, canNext, onBack, onNext, caption, children, active = true }: {
  e: Exercise; clip: FigureClip | null; canBack: boolean; canNext: boolean; onBack: () => void; onNext: () => void;
  /** false = draw the loop-start frame only (off-screen pages of a pager) */
  active?: boolean;
  /** small line under the name (dosage, section…) */
  caption?: string;
  children?: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const W = width - 32;
  const H = Math.round(W * 1.0);
  const Fig = active ? FigureCard : FigureStill;
  return (
    <View style={[styles.body, { width }]}>
      <View style={[styles.stage, { width: W, height: H }]}>
        {clip ? <Fig clip={clip} width={W} height={H} /> : <Ionicons name="body-outline" size={48} color={colors.muted} />}
        {canBack && <Pressable onPress={onBack} hitSlop={12} style={[styles.arrow, { start: 6 }]}><Ionicons name="chevron-back" size={28} color="#ffffff" /></Pressable>}
        {canNext && <Pressable onPress={onNext} hitSlop={12} style={[styles.arrow, { end: 6 }]}><Ionicons name="chevron-forward" size={28} color="#ffffff" /></Pressable>}
      </View>
      <Text style={styles.name}>{e.name}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <View style={styles.tags}>
        {e.pattern && <Tag label={e.pattern} color={patternColor[e.pattern]} />}
        {e.slots.filter((t) => t !== e.pattern).map((t) => <Tag key={t} label={t} color={slotColor[t] ?? colors.muted} />)}
      </View>
      <View style={{ flex: 1 }} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 16, paddingBottom: 28, gap: 8, alignItems: 'center' },
  stage: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  arrow: { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(14,16,20,0.55)', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  caption: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center', justifyContent: 'center' },
});
