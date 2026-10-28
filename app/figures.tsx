import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Figure, clipFromProcessed, useFps, type FigureClip } from '../src/figure';
import { processCapture, type RawFrame } from '../src/pipeline';
import { Button } from './index';

/** Phase 2 dev screen: the 3 fixture segments looping as cards + a full-size player. */
const FIXTURES: { name: string; load: () => RawFrame[]; pick: (segs: ReturnType<typeof processCapture>) => ReturnType<typeof processCapture>[number] }[] = [
  { name: 'standing flow (reel 1 · seg 1)', load: () => require('../reference/sample-data/reel1_mobility_mp33.json'), pick: (s) => s[0] },
  { name: 'burpee-lunge loop (reel 3)', load: () => require('../reference/sample-data/reel3_burpee_mp33.json'), pick: (s) => s.reduce((a, b) => (b.xy.length > a.xy.length ? b : a)) },
  { name: 'staff flow (reel 2)', load: () => require('../reference/sample-data/reel2_staff_mp33.json'), pick: (s) => s[0] },
];

export default function Figures() {
  const fps = useFps();
  const [sel, setSel] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [hud, setHud] = useState(true);
  const [frame, setFrame] = useState(0);

  const clips = useMemo<{ name: string; clip: FigureClip; frames: number; period?: number }[]>(() => {
    const t0 = Date.now();
    const out = FIXTURES.map((f) => {
      const segs = processCapture({ frames: f.load() });
      const seg = f.pick(segs);
      return { name: f.name, clip: clipFromProcessed(seg), frames: seg.xy.length, period: seg.period?.periodic ? seg.period.period : undefined };
    });
    console.log(`figures: pipeline on 3 fixtures took ${Date.now() - t0} ms`);
    return out;
  }, []);

  const W = Dimensions.get('window').width;
  const cardW = Math.floor((W - 16 * 2 - 8 * 2) / 3);
  const cardH = Math.round(cardW * 1.25);
  const playerW = W - 32;
  const playerH = Math.round(playerW * 1.25);
  const cur = clips[sel];

  return (
    <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <Text style={styles.mono}>UI thread: {fps} fps · 3 cards + player looping</Text>
      <View style={styles.row}>
        {clips.map((c, i) => (
          <Pressable key={c.name} onPress={() => setSel(i)} style={[styles.card, i === sel && styles.cardSel]}>
            <Figure clip={c.clip} width={cardW} height={cardH} loopWindow speed={1} />
            <Text style={styles.small} numberOfLines={2}>{c.name}</Text>
          </Pressable>
        ))}
      </View>
      <Figure clip={cur.clip} width={playerW} height={playerH} playing={playing} speed={speed} mirror={mirror} hud={hud} loopWindow={false} onFrame={setFrame} style={styles.player} />
      <Text style={styles.mono}>
        {cur.name} · {cur.frames} frames · frame {frame}{cur.period ? ` · period ${cur.period.toFixed(2)} s` : ' · not periodic'}
      </Text>
      <View style={styles.row}>
        <Button title={playing ? '❚❚ Pause' : '▶ Play'} onPress={() => setPlaying(!playing)} secondary />
        <Button title={`speed ${speed}×`} onPress={() => setSpeed(speed === 1 ? 0.5 : speed === 0.5 ? 2 : 1)} secondary />
      </View>
      <View style={styles.toggles}>
        <View style={styles.toggle}><Switch value={mirror} onValueChange={setMirror} /><Text style={styles.small}>mirror</Text></View>
        <View style={styles.toggle}><Switch value={hud} onValueChange={setHud} /><Text style={styles.small}>angle HUD</Text></View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 80 },
  row: { flexDirection: 'row', gap: 8 },
  card: { borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', gap: 4, flex: 1 },
  cardSel: { borderColor: '#d85a30' },
  player: { borderRadius: 14 },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: '#333' },
  small: { fontSize: 11, color: '#555' },
  toggles: { flexDirection: 'row', gap: 16 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
