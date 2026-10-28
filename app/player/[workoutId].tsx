import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../src/db';
import { clipFromExercise } from '../../src/db/repo';
import { endSession, getFramework, getWorkout, startSession } from '../../src/db/workoutRepo';
import { schema } from '../../src/db';
import type { Exercise } from '../../src/db/schema';
import type { SessionFeedback } from '../../src/db/types';
import { FigurePlayer } from '../../src/figure';
import { back, createPlayer, pause, play, plus, skip, tick, workProgress, type PlayerState } from '../../src/player/machine';
import { buildTimeline, totalTimelineSeconds, type Step } from '../../src/player/timeline';
import { Button } from '../../src/ui/Button';
import Animated, { FadeIn, SlideInRight, ZoomIn } from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import { patternColor as PC } from '../../src/ui/theme';
import { SwipeNav } from '../../src/ui/SwipeNav';
import { colors, patternColor, radius } from '../../src/ui/theme';

const TICK_MS = 250;

/** Phase 6: full-screen player. Big figure, big countdown, next-up, round counter, auto-advance,
 *  haptics + beeps, keep-awake, pause/skip/back/+15, end screen with feedback → session row. */
export default function Player() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useKeepAwake();
  const [exById, setExById] = useState<Map<string, Exercise>>(new Map());
  const [state, setState] = useState<PlayerState | null>(null);
  const [blockNames, setBlockNames] = useState<Record<string, { name: string; rounds: number }>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const sounds = useRef<{ tick?: AudioPlayer; go?: AudioPlayer; done?: AudioPlayer }>({});
  const stateRef = useRef<PlayerState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    (async () => {
      const w = await getWorkout(db, workoutId);
      if (!w) { Alert.alert('Workout not found'); router.back(); return; }
      const fw = await getFramework(db, w.frameworkId);
      if (!fw) { Alert.alert('Framework not found'); router.back(); return; }
      const rows = await db.select().from(schema.exercise);
      const map = new Map(rows.map((e) => [e.id, e]));
      setExById(map);
      setBlockNames(Object.fromEntries(fw.blocks.blocks.map((b) => [b.id, { name: b.name, rounds: b.kind === 'rounds' ? b.rounds ?? 1 : 1 }])));
      const steps = buildTimeline(w.items, fw.blocks, { repSecondsOf: (id) => map.get(id)?.repSeconds ?? null, restBetweenRoundsSec: w.inputs.restBetweenRoundsSec, restBetweenExercisesSec: w.inputs.restBetweenExercisesSec });
      setState(createPlayer(steps));
      setSessionId(await startSession(db, w.id));
      try {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
        sounds.current = { tick: createAudioPlayer(require('../../assets/sounds/tick.wav')), go: createAudioPlayer(require('../../assets/sounds/go.wav')), done: createAudioPlayer(require('../../assets/sounds/done.wav')) };
      } catch (e) { console.warn('audio unavailable', e); }
    })();
    return () => { for (const p of Object.values(sounds.current)) { try { p?.remove(); } catch {} } };
  }, [workoutId]);

  // the clock
  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      const s = stateRef.current;
      if (!s || !s.playing) return;
      const r = tick(s, dt);
      if (r.events.length) handleEvents(r.events);
      setState(r.state);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const beep = (which: 'tick' | 'go' | 'done') => { const p = sounds.current[which]; if (!p) return; try { p.seekTo(0); p.play(); } catch {} };
  const handleEvents = (events: ReturnType<typeof tick>['events']) => {
    for (const e of events) {
      if (e.type === 'countdown') { beep('tick'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }
      if (e.type === 'go') { beep('go'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); setFlash(true); setTimeout(() => setFlash(false), 450); }
      if (e.type === 'step') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (e.type === 'finished') { beep('done'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    }
  };
  const act = (fn: (s: PlayerState) => { state: PlayerState; events: ReturnType<typeof tick>['events'] } | PlayerState) => {
    setState((s) => { if (!s) return s; const r = fn(s); if ('events' in (r as any)) { const rr = r as { state: PlayerState; events: ReturnType<typeof tick>['events'] }; handleEvents(rr.events); return rr.state; } return r as PlayerState; });
  };

  const finish = async (feedback: SessionFeedback) => {
    if (sessionId) await endSession(db, sessionId, feedback);
    if (router.canDismiss?.()) router.dismissAll();
    router.replace('/today');
  };

  const step: Step | undefined = state?.steps[state.index];
  const exId = !step ? null : step.kind === 'work' ? step.exerciseId : step.kind === 'done' ? null : step.nextExerciseId;
  const ex = exId ? exById.get(exId) : undefined;
  // hooks must run on every render — keep this above the early return
  const clip = useMemo(() => (ex ? clipFromExercise(ex) : null), [ex?.id]);
  if (!state || !step) return <View style={styles.center}><Text style={styles.small}>Loading…</Text></View>;
  const W = Dimensions.get('window').width;
  const H = Dimensions.get('window').height;
  const nextEx = step.kind === 'work' && step.nextExerciseId ? exById.get(step.nextExerciseId) : null;
  const secs = Math.ceil(state.remainingMs / 1000);
  const prog = workProgress(state);
  const block = step.kind !== 'done' ? blockNames[step.blockId] : undefined;
  const total = totalTimelineSeconds(state.steps);
  const elapsedFrac = Math.min(1, state.elapsedMs / 1000 / Math.max(1, total));
  const isRest = step.kind === 'rest' || step.kind === 'ready';

  if (state.finished) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 40, gap: 18 }]}>
        <ConfettiCannon count={140} origin={{ x: Dimensions.get('window').width / 2, y: -10 }} fadeOut autoStart explosionSpeed={400} fallSpeed={2600} colors={[PC.push, PC.pull, PC.core, PC.skill, PC.mobility, colors.accent]} />
        <Animated.View entering={ZoomIn.springify().damping(10)}><Ionicons name="checkmark-circle" size={72} color={colors.success} /></Animated.View>
        <Text style={styles.doneTitle}>Workout done</Text>
        <Text style={styles.small}>{Math.round(state.elapsedMs / 60000)} min · {prog.total} exercises</Text>
        <Text style={styles.label}>How was it?</Text>
        <View style={styles.feedbackRow}>
          {([['easy', 'Easy'], ['right', 'Just right'], ['hard', 'Hard']] as [SessionFeedback, string][]).map(([k, l]) => (
            <Pressable key={k} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); finish(k); }} style={({ pressed }) => [styles.feedbackBtn, pressed && { backgroundColor: colors.accent, transform: [{ scale: 0.96 }] }]}><Text style={styles.feedbackText}>{l}</Text></Pressable>
          ))}
        </View>
      </View>
    );
  }

  const figH = Math.round(Math.min(H * 0.52, W * 1.15));
  return (
    <View style={[styles.root, isRest && { backgroundColor: '#e4e9ef' }]}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => Alert.alert('Leave the workout?', undefined, [{ text: 'Keep going' }, { text: 'Leave', style: 'destructive', onPress: () => finish('right') }])} hitSlop={14} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
        <Text style={styles.blockText}>{block?.name}{block && block.rounds > 1 && step.kind !== 'done' ? ` · round ${step.round}/${block.rounds}` : ''}</Text>
        <Text style={styles.small}>{prog.done}/{prog.total}</Text>
      </View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${elapsedFrac * 100}%` }]} /></View>

      <SwipeNav onNext={() => act(skip)} onBack={() => act(back)} style={{ flex: 1 }}>
      <View style={{ alignItems: 'center' }}>
        {clip ? <FigurePlayer clip={clip} width={W} height={figH} speed={1} style={{ opacity: isRest ? 0.55 : 1 }} /> : <View style={{ width: W, height: figH }} />}
      </View>

      <Animated.View key={state.index} entering={SlideInRight.springify().damping(18)} style={styles.middle}>
        {step.kind === 'rest' && <Text style={styles.restBig}>REST</Text>}
        <Text style={styles.stepLabel}>{step.label}</Text>
        <Text style={styles.exName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{isRest ? (ex ? `Next: ${ex.name}` : '') : ex?.name ?? ''}</Text>
        {ex?.pattern && !isRest && <Text style={[styles.pattern, { color: patternColor[ex.pattern] }]}>{ex.pattern}</Text>}
        <Animated.Text key={`${state.index}-${secs}`} entering={secs <= 3 && !isRest ? ZoomIn.springify().damping(9) : FadeIn.duration(80)} style={[styles.countdown, isRest && { color: colors.muted }, flash && { color: colors.accent }]}>{secs}</Animated.Text>
        <View style={styles.stepBar}><View style={[styles.stepFill, { width: `${Math.max(0, Math.min(100, 100 * (1 - state.remainingMs / Math.max(1, step.seconds * 1000))))}%`, backgroundColor: isRest ? colors.muted : colors.accent }]} /></View>
        {!isRest && nextEx && <Text style={styles.small}>then: {nextEx.name}</Text>}
        <Text style={[styles.small, { marginTop: 6 }]}>swipe ← skip · swipe → back</Text>
      </Animated.View>
      </SwipeNav>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}>
        <Ctl icon="play-skip-back" onPress={() => act(back)} />
        <Ctl icon={state.playing ? 'pause' : 'play'} big onPress={() => act((s) => (s.playing ? pause(s) : play(s)))} />
        <Ctl icon="play-skip-forward" onPress={() => act(skip)} />
        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); act((s) => plus(s, 15)); }} style={({ pressed }) => [styles.plus, pressed && { transform: [{ scale: 0.94 }], opacity: 0.8 }]} hitSlop={10}><Text style={styles.plusText}>+15 s</Text></Pressable>
      </View>
    </View>
  );
}

function Ctl({ icon, onPress, big }: { icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; big?: boolean }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      style={({ pressed }) => [styles.ctl, big && styles.ctlBig, pressed && { transform: [{ scale: 0.92 }], opacity: 0.85 }]}
      hitSlop={12}
    >
      <Ionicons name={icon} size={big ? 40 : 28} color={big ? '#fff' : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  blockText: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  progress: { height: 4, backgroundColor: colors.line, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.accent },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 4 },
  stepLabel: { fontSize: 14, color: colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  restBig: { fontSize: 34, fontWeight: '900', color: colors.accent, letterSpacing: 4 },
  exName: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  pattern: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  countdown: { fontSize: 96, fontWeight: '900', color: colors.ink, fontVariant: ['tabular-nums'], lineHeight: 104 },
  stepBar: { width: '70%', height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden', marginTop: 4 },
  stepFill: { height: 6, borderRadius: 3 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingHorizontal: 16 },
  ctl: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  ctlBig: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.accent },
  plus: { position: 'absolute', right: 20, bottom: 36, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.m, backgroundColor: colors.surfaceAlt },
  plusText: { fontWeight: '700', color: colors.ink },
  small: { fontSize: 13, color: colors.muted },
  label: { fontWeight: '700', color: colors.ink, marginTop: 8 },
  doneTitle: { fontSize: 28, fontWeight: '900', color: colors.ink },
  feedbackRow: { flexDirection: 'row', gap: 10 },
  feedbackBtn: { paddingHorizontal: 18, paddingVertical: 16, borderRadius: radius.l, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  feedbackText: { fontWeight: '700', color: colors.ink, fontSize: 16 },
});
