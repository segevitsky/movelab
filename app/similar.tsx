import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db, schema } from '../src/db';
import { useClipCache } from '../src/ui/useClipCache';
import { FigureStill } from '../src/figure';
import { ALIKE_THRESHOLD, alikePairs, fingerprintOf } from '../src/similarity';
import type { Exercise } from '../src/db/schema';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/primitives';
import { colors, hit, radius, space, type } from '../src/ui/theme';

type Verdict = 'yes' | 'no';
const FILE = () => new File(Paths.document, 'similar-verdicts.json');
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

/**
 * Phase 12 calibration (dev): the score's guesses over the library, best first; the owner answers
 * "alike" / "not alike" per pair. Verdicts are kept in Documents/similar-verdicts.json and can be shared.
 * The suggested threshold is the cut that agrees with the most verdicts.
 */
export default function SimilarPairs() {
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const clips = useClipCache(exercises);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  useEffect(() => { try { const f = FILE(); if (f.exists) setVerdicts(JSON.parse(f.textSync())); } catch {} }, []);
  const save = (v: Record<string, Verdict>) => { setVerdicts(v); try { const f = FILE(); if (f.exists) f.delete(); f.write(JSON.stringify(v)); } catch (e) { Alert.alert('Could not save', String(e)); } };

  const pairs = useMemo(() => {
    const rows = (exercises ?? []).filter((e) => !e.archived && e.figure);
    return alikePairs(rows.map((e) => ({ item: e, fp: fingerprintOf(e) })), 0.5).slice(0, 60);
  }, [exercises]);

  const suggestion = useMemo(() => {
    const scored = pairs.map((p) => ({ s: p.score, v: verdicts[pairKey(p.a.id, p.b.id)] })).filter((x) => x.v);
    if (scored.length < 3) return null;
    let best = { t: ALIKE_THRESHOLD, acc: -1 };
    for (let t = 0.5; t <= 0.96; t += 0.01) {
      const acc = scored.filter((x) => (x.v === 'yes') === (x.s >= t)).length / scored.length;
      if (acc > best.acc) best = { t, acc };
    }
    return { ...best, n: scored.length };
  }, [pairs, verdicts]);

  const answered = pairs.filter((p) => verdicts[pairKey(p.a.id, p.b.id)]).length;
  const share = async () => {
    const f = FILE();
    if (!f.exists) { Alert.alert('Nothing to share yet'); return; }
    const payload = { verdicts, pairs: pairs.map((p) => ({ a: p.a.name, b: p.b.name, score: Math.round(p.score * 100) / 100, verdict: verdicts[pairKey(p.a.id, p.b.id)] ?? null })), suggestion };
    const out = new File(Paths.cache, 'similar-verdicts.json');
    if (out.exists) out.delete();
    out.write(JSON.stringify(payload, null, 2));
    await Sharing.shareAsync(out.uri, { mimeType: 'application/json', dialogTitle: 'Similar-pairs verdicts' });
  };

  return (
    <Screen scroll contentStyle={{ gap: space.m }}>
      <Text style={styles.lead}>Does each pair move the same way? Best guesses first. Your answers set how strict "alike" is.</Text>
      <View style={styles.stats}>
        <Text style={styles.small}>{answered} / {pairs.length} answered · current line {Math.round(ALIKE_THRESHOLD * 100)} %</Text>
        {suggestion ? <Text style={styles.small}>suggested line {Math.round(suggestion.t * 100)} % (agrees with {Math.round(suggestion.acc * 100)} % of {suggestion.n})</Text> : null}
      </View>
      {pairs.length === 0 ? <Text style={styles.small}>No candidate pairs (nothing scores above 50 %).</Text> : null}
      {pairs.map((p) => {
        const k = pairKey(p.a.id, p.b.id);
        const v = verdicts[k];
        return (
          <View key={k} style={[styles.card, v === 'yes' && { borderColor: colors.danger }, v === 'no' && { borderColor: colors.success }]}>
            <View style={styles.pair}>
              <Side e={p.a} clip={clips.get(p.a)} />
              <Text style={styles.score}>{Math.round(p.score * 100)} %</Text>
              <Side e={p.b} clip={clips.get(p.b)} />
            </View>
            <View style={styles.answers}>
              <Pressable onPress={() => save({ ...verdicts, [k]: 'yes' })} style={[styles.answer, v === 'yes' && { backgroundColor: colors.danger }]}><Ionicons name="copy-outline" size={16} color={v === 'yes' ? colors.onAccent : colors.ink} /><Text style={[styles.answerText, v === 'yes' && { color: colors.onAccent }]}>Alike</Text></Pressable>
              <Pressable onPress={() => save({ ...verdicts, [k]: 'no' })} style={[styles.answer, v === 'no' && { backgroundColor: colors.success }]}><Ionicons name="git-compare-outline" size={16} color={v === 'no' ? colors.onAccent : colors.ink} /><Text style={[styles.answerText, v === 'no' && { color: colors.onAccent }]}>Different</Text></Pressable>
            </View>
          </View>
        );
      })}
      <Button title="Share verdicts (JSON)" icon="share-outline" secondary onPress={share} />
    </Screen>
  );
}

function Side({ e, clip }: { e: Exercise; clip: ReturnType<ReturnType<typeof useClipCache>['get']> }) {
  return (
    <View style={styles.side}>
      <View style={styles.thumb}>{clip ? <FigureStill clip={clip} width={96} height={110} /> : <Ionicons name="body-outline" size={24} color={colors.muted} />}</View>
      <Text style={styles.name} numberOfLines={2}>{e.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.body, color: colors.inkSoft },
  stats: { gap: 2 },
  small: { ...type.caption, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: radius.l, padding: space.m, gap: space.s, borderWidth: 1, borderColor: colors.line },
  pair: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  side: { flex: 1, alignItems: 'center', gap: 4 },
  thumb: { width: 96, height: 110, borderRadius: radius.m, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  name: { ...type.caption, color: colors.ink, textAlign: 'center' },
  score: { ...type.h3, color: colors.ink, fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'center' },
  answers: { flexDirection: 'row', gap: space.s },
  answer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: hit.min, borderRadius: radius.m, backgroundColor: colors.surfaceAlt },
  answerText: { ...type.bodyStrong, color: colors.ink },
});
