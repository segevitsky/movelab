import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db, schema } from '../src/db';
import { useClipCache } from '../src/ui/useClipCache';
import { FigureCard } from '../src/figure';
import { ALIKE_THRESHOLD, alikePairs, fingerprintOf } from '../src/similarity';
import type { Exercise } from '../src/db/schema';
import { Button, IconButton } from '../src/ui/Button';
import { Screen } from '../src/ui/primitives';
import { CreatorName } from '../src/ui/CreatorName';
import { colors, hit, radius, space, type } from '../src/ui/theme';

type Verdict = 'yes' | 'no';
const FILE = () => new File(Paths.document, 'similar-answers.json');
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

/**
 * Phase 12 calibration (dev): one pair at a time, both figures looping large. The owner answers Alike /
 * Different (or skips); verdicts live in Documents/similar-verdicts.json. The suggested threshold is the
 * cut that agrees with the most verdicts.
 */
export default function SimilarPairs() {
  const { width } = useWindowDimensions();
  const { data: exercises } = useLiveQuery(db.select().from(schema.exercise));
  const clips = useClipCache(exercises);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const f = FILE();
      if (f.exists) { setVerdicts(JSON.parse(f.textSync())); return; }
      // answers from the first build lived in similar-verdicts.json (now the share payload's name)
      const legacy = new File(Paths.document, 'similar-verdicts.json');
      if (legacy.exists) { const j = JSON.parse(legacy.textSync()); const v = j.verdicts ?? j; if (v && typeof v === 'object' && !Array.isArray(v)) { setVerdicts(v); f.write(JSON.stringify(v)); } }
    } catch {}
  }, []);
  const save = (v: Record<string, Verdict>) => { setVerdicts(v); try { const f = FILE(); if (f.exists) f.delete(); f.writeSync(JSON.stringify(v)); } catch (e) { Alert.alert('Could not save', String(e)); } };

  const pairs = useMemo(() => {
    const rows = (exercises ?? []).filter((e) => !e.archived && e.figure);
    return alikePairs(rows.map((e) => ({ item: e, fp: fingerprintOf(e) })), 0.5).slice(0, 60);
  }, [exercises]);
  const pending = pairs.filter((p) => !verdicts[pairKey(p.a.id, p.b.id)] && !skipped.has(pairKey(p.a.id, p.b.id)));
  const cur = pending[0];
  const answered = pairs.length - pending.length + 0;

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

  const share = async () => {
    // the drills involved travel with the verdicts (skeleton + tags, never video) so the fit can be redone offline
    const involved = new Map<string, Exercise>();
    for (const p of pairs) { involved.set(p.a.id, p.a); involved.set(p.b.id, p.b); }
    const payload = {
      verdicts,
      pairs: pairs.map((p) => ({ aId: p.a.id, bId: p.b.id, a: p.a.name, b: p.b.name, score: Math.round(p.score * 100) / 100, verdict: verdicts[pairKey(p.a.id, p.b.id)] ?? null })),
      suggestion,
      exercises: [...involved.values()].map((e) => ({ id: e.id, name: e.name, pattern: e.pattern, slots: e.slots, figure: e.figure, figureFps: e.figureFps, loopStart: e.loopStart, loopEnd: e.loopEnd, scene: e.scene, repSeconds: e.repSeconds })),
    };
    const out = new File(Paths.document, 'similar-verdicts.json');
    if (out.exists) out.delete();
    await out.write(JSON.stringify(payload));
    try {
      await Sharing.shareAsync(out.uri, { mimeType: 'application/json', dialogTitle: 'Similar-pairs verdicts' });
    } catch (e) {
      Alert.alert('Share sheet failed', `Saved anyway: Files app ▸ On My iPhone ▸ MoveLab ▸ similar-verdicts.json. AirDrop it from there.\n\n${String(e)}`);
    }
  };

  const W = Math.floor((width - space.l * 2 - space.s) / 2);
  const H = Math.round(W * 1.2);
  const answer = (v: Verdict) => { if (cur) save({ ...verdicts, [pairKey(cur.a.id, cur.b.id)]: v }); };
  const nYes = Object.values(verdicts).filter((v) => v === 'yes').length;

  return (
    <Screen scroll contentStyle={{ gap: space.m }}>
      <Text style={styles.lead}>Do these two move the same way?</Text>
      <Text style={styles.small}>
        {Object.keys(verdicts).length} answered · {pending.length} left · {nYes} alike so far
        {suggestion ? ` · suggested line ${Math.round(suggestion.t * 100)} % (fits ${Math.round(suggestion.acc * 100)} % of answers)` : ` · line now ${Math.round(ALIKE_THRESHOLD * 100)} %`}
      </Text>
      {cur ? (
        <>
          <View style={styles.pair}>
            <Side e={cur.a} clip={clips.get(cur.a)} w={W} h={H} />
            <Side e={cur.b} clip={clips.get(cur.b)} w={W} h={H} />
          </View>
          <Text style={styles.score}>score {Math.round(cur.score * 100)} %</Text>
          <View style={styles.answers}>
            <Button title="Alike" icon="copy-outline" size="l" danger onPress={() => answer('yes')} style={{ flex: 1 }} />
            <Button title="Different" icon="git-compare-outline" size="l" onPress={() => answer('no')} style={{ flex: 1 }} />
            <IconButton icon="play-skip-forward" size={56} onPress={() => setSkipped(new Set([...skipped, pairKey(cur.a.id, cur.b.id)]))} />
          </View>
        </>
      ) : (
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={48} color={colors.success} />
          <Text style={styles.lead}>{pairs.length === 0 ? 'No candidate pairs: nothing in the library scores above 50 %.' : 'All pairs answered. Tell Claude the suggested line, or share the JSON.'}</Text>
        </View>
      )}
      <Button title="Share verdicts (JSON)" icon="share-outline" secondary onPress={share} />
      {Object.keys(verdicts).length > 0 && <Button title="Start over" ghost onPress={() => Alert.alert('Clear all answers?', undefined, [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: () => { save({}); setSkipped(new Set()); } }])} />}
    </Screen>
  );
}

function Side({ e, clip, w, h }: { e: Exercise; clip: ReturnType<ReturnType<typeof useClipCache>['get']>; w: number; h: number }) {
  return (
    <View style={{ width: w, gap: 6 }}>
      <View style={[styles.stage, { width: w, height: h }]}>{clip ? <FigureCard clip={clip} width={w} height={h} /> : <Ionicons name="body-outline" size={28} color={colors.muted} />}</View>
      <CreatorName name={e.name} style={styles.name} numberOfLines={2} link={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.h3, color: colors.ink },
  small: { ...type.caption, color: colors.muted },
  pair: { flexDirection: 'row', gap: space.s },
  stage: { borderRadius: radius.l, overflow: 'hidden', backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  name: { ...type.body, fontSize: 14, color: colors.ink, textAlign: 'center' },
  score: { ...type.caption, color: colors.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
  answers: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit.control },
  done: { alignItems: 'center', gap: space.m, paddingVertical: space.xl },
});
