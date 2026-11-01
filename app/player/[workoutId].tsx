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
import { endSession, getFramework, getWorkout, startSession, updateWorkoutItems } from '../../src/db/workoutRepo';
import { ExercisePicker } from '../../src/ui/ExercisePicker';
import type { FrameworkBlocks } from '../../src/db/types';
import { schema } from '../../src/db';
import type { Exercise } from '../../src/db/schema';
import type { SessionFeedback } from '../../src/db/types';
import { FigurePlayer } from '../../src/figure';
import { back, backBlock, createPlayer, pause, play, plus, skip, skipBlock, tick, workProgress, type PlayerState } from '../../src/player/machine';
import { buildTimeline, totalTimelineSeconds, type Step } from '../../src/player/timeline';
import { Button, IconButton } from '../../src/ui/Button';
import { BigTimer } from '../../src/ui/BigTimer';
import { DirectionalIcon } from '../../src/ui/primitives';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import { patternColor as PC } from '../../src/ui/theme';
import { SwipeNav } from '../../src/ui/SwipeNav';
import { colors, hit, patternColor, radius, space, type } from '../../src/ui/theme';

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
  const [swapOpen, setSwapOpen] = useState(false);
  const [allEx, setAllEx] = useState<Exercise[]>([]);
  const wRef = useRef<{ id: string; items: any[]; blocks: FrameworkBlocks } | null>(null);
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
      setAllEx(rows);
      wRef.current = { id: w.id, items: w.items, blocks: fw.blocks };
      setBlockNames(Object.fromEntries(fw.blocks.blocks.map((b) => [b.id, { name: b.name, rounds: b.kind === 'rounds' ? b.rounds ?? 1 : 1 }])));
      const steps = buildTimeline(w.items, fw.blocks, { repSecondsOf: (id) => map.get(id)?.repSeconds ?? null, restBetweenRoundsSec: w.inputs.restBetweenRoundsSec, restBetweenExercisesSec: w.inputs.restBetweenExercisesSec, restBetweenSectionsSec: w.inputs.restBetweenSectionsSec, blockOverrides: w.inputs.blockOverrides });
      wRef.current = { id: w.id, items: w.items, blocks: fw.blocks, inputs: w.inputs } as any;
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

  /** The work step a swap applies to: the current one, or the upcoming one during rest / get-ready. */
  const swapTarget = (s: PlayerState) => {
    const cur = s.steps[s.index];
    if (cur.kind === 'work') return cur;
    for (let i = s.index + 1; i < s.steps.length; i++) { const st = s.steps[i]; if (st.kind === 'work') return st; }
    return null;
  };
  /** Swap a drill for the rest of the workout (persisted): the current one, or the next one during rest. */
  const swapCurrent = async (ex: Exercise) => {
    const s = stateRef.current;
    const wr = wRef.current;
    if (!s || !wr) return;
    const cur = s.steps[s.index];
    const target = swapTarget(s);
    if (!target) return;
    const items = wr.items.map((i: any) => (i.blockId === target.blockId && i.slotId === target.slotId && i.round >= target.round ? { ...i, exerciseId: ex.id, locked: true } : i));
    wr.items = items;
    await updateWorkoutItems(db, wr.id, items);
    const inp = (wr as any).inputs ?? {};
    const steps = buildTimeline(items, wr.blocks, { repSecondsOf: (id) => exById.get(id)?.repSeconds ?? null, restBetweenRoundsSec: inp.restBetweenRoundsSec, restBetweenExercisesSec: inp.restBetweenExercisesSec, restBetweenSectionsSec: inp.restBetweenSectionsSec, blockOverrides: inp.blockOverrides });
    if (cur.kind === 'work') {
      // continue from the same work step (block/slot/round), keeping its remaining time
      const idx = steps.findIndex((st) => st.kind === 'work' && st.blockId === cur.blockId && st.slotId === cur.slotId && st.round === cur.round);
      setState({ ...s, steps, index: Math.max(0, idx), remainingMs: Math.min(s.remainingMs, (steps[Math.max(0, idx)]?.seconds ?? 0) * 1000 || s.remainingMs) });
    } else {
      // same structure, same position: only the upcoming drill changed
      setState({ ...s, steps });
    }
    setSwapOpen(false);
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
  if (!state || !step) return <View style={styles.center}><Text style={styles.doneMeta}>Loading…</Text></View>;
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
      <View style={[styles.center, { paddingTop: insets.top + 40, gap: space.l }]}>
        <ConfettiCannon count={140} origin={{ x: W / 2, y: -10 }} fadeOut autoStart explosionSpeed={400} fallSpeed={2600} colors={[PC.push, PC.pull, PC.core, PC.skill, PC.mobility, colors.accent]} />
        <Animated.View entering={ZoomIn.springify().damping(10)}><Ionicons name="checkmark-circle" size={80} color={colors.success} /></Animated.View>
        <Text style={styles.doneTitle}>Workout done</Text>
        <Text style={styles.doneMeta}>{Math.round(state.elapsedMs / 60000)} min · {prog.total} exercises</Text>
        <Text style={styles.eyebrow}>How was it?</Text>
        <View style={styles.feedbackRow}>
          {([['easy', 'Easy'], ['right', 'Just right'], ['hard', 'Hard']] as [SessionFeedback, string][]).map(([k, l]) => (
            <Button key={k} title={l} size="l" secondary={k !== 'right'} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); finish(k); }} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
    );
  }

  // Budget the stage from what is left after the bars, the text block and the controls (nothing may
  // overlap). The timer shrinks from 168 to 136 pt only when the figure would otherwise drop under 45 %.
  const stageW = W - space.m * 2;
  const topBar = insets.top + 4 + hit.min + space.s + 2;
  const controlsH = space.s + hit.primary + insets.bottom + space.m;
  const middleFor = (timer: number) => 18 + 34 + Math.round(timer * 1.05) + 10 + 26 + 4 * space.xs + space.m;
  let timerSize = W < 390 ? 160 : 168;
  let figH = H - topBar - space.m - middleFor(timerSize) - controlsH;
  if (figH < H * 0.45) { timerSize = 136; figH = H - topBar - space.m - middleFor(timerSize) - controlsH; }
  figH = Math.round(Math.max(H * 0.36, Math.min(figH, stageW * 1.25)));
  const timerState = !state.playing ? 'paused' : isRest ? 'rest' : 'work';
  const stepProgress = Math.max(0, Math.min(1, 1 - state.remainingMs / Math.max(1, step.seconds * 1000)));
  const canBackBlock = backBlock(state).state.index !== state.index;
  const eyebrow = step.kind === 'work' ? `${step.label}${ex?.pattern ? ` · ${ex.pattern}` : ''}` : step.kind === 'rest' ? 'Rest' : step.kind === 'ready' ? 'Get ready' : step.label;
  const eyebrowColor = step.kind === 'work' && ex?.pattern ? patternColor[ex.pattern] : isRest ? colors.rest : colors.muted;
  const headline = isRest ? (ex ? `Next · ${ex.name}` : '') : ex?.name ?? '';
  const confirmLeave = () => Alert.alert('Leave the workout?', undefined, [{ text: 'Keep going' }, { text: 'Leave', style: 'destructive', onPress: () => finish('right') }]);

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="close" size={hit.min} onPress={confirmLeave} />
        <SwipeNav style={styles.sectionPill} onNext={() => { if (step.kind !== 'done') { Haptics.selectionAsync().catch(() => {}); act(skipBlock); } }} onBack={() => { if (canBackBlock) { Haptics.selectionAsync().catch(() => {}); act(backBlock); } }}>
          <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); act(backBlock); }} hitSlop={8} disabled={!canBackBlock} style={[styles.sectionArrow, !canBackBlock && { opacity: 0 }]} accessibilityLabel="Previous section">
            <DirectionalIcon name="play-back" size={16} color={colors.inkSoft} />
          </Pressable>
          <Text style={styles.blockText} numberOfLines={1}>{block?.name}{block && block.rounds > 1 && step.kind !== 'done' ? ` · ${step.round}/${block.rounds}` : ''}</Text>
          <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); act(skipBlock); }} hitSlop={8} disabled={step.kind === 'done'} style={[styles.sectionArrow, step.kind === 'done' && { opacity: 0 }]} accessibilityLabel="Next section">
            <DirectionalIcon name="play-forward" size={16} color={colors.inkSoft} />
          </Pressable>
        </SwipeNav>
        <View style={styles.topEnd}>
          <Text style={styles.progressText}>{prog.done}/{prog.total}</Text>
          {step.kind !== 'done' ? (
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setSwapOpen(true); }} hitSlop={6} style={({ pressed }) => [styles.swapBtn, pressed && { opacity: 0.8 }]} accessibilityLabel="Swap drill">
              <Ionicons name="swap-horizontal" size={18} color={colors.ink} />
              <Text style={styles.swapText}>Swap</Text>
            </Pressable>
          ) : <View style={{ width: hit.min }} />}
        </View>
      </View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${elapsedFrac * 100}%` }]} /></View>

      <SwipeNav onNext={() => act(skip)} onBack={() => act(back)} style={{ flex: 1 }}>
        <View style={styles.stageWrap}>
          <View style={[styles.stage, { width: stageW, height: figH }]}>
            {clip ? <FigurePlayer clip={clip} width={stageW} height={figH} speed={1} playing={state.playing} /> : <View style={{ width: stageW, height: figH, backgroundColor: colors.surface }} />}
            <View style={StyleSheet.absoluteFill} accessible={false} />
          </View>
        </View>

        <Animated.View key={state.index} entering={FadeIn.duration(220)} style={styles.middle}>
          <Text style={[styles.eyebrow, { color: eyebrowColor }]} numberOfLines={1}>{eyebrow}</Text>
          <Text style={styles.exName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{headline}</Text>
          <BigTimer seconds={secs} state={timerState} flash={flash} progress={stepProgress} size={timerSize} style={{ marginTop: space.xs }} />
          {!isRest && nextEx ? <Text style={styles.next} numberOfLines={1}>then · {nextEx.name}</Text> : <Text style={styles.next}> </Text>}
        </Animated.View>
      </SwipeNav>

      {swapOpen && step.kind !== 'done' && (() => {
        const target = swapTarget(state);
        if (!target) return null;
        const tEx = exById.get(target.exerciseId);
        const b = wRef.current?.blocks.blocks.find((x) => x.id === target.blockId);
        const tags = b?.slots.find((sl) => sl.id === target.slotId)?.tags ?? [];
        return <ExercisePicker visible title={`Swap "${tEx?.name ?? ''}" for…`} exercises={allEx} preferTags={tags} onPick={swapCurrent} onClose={() => setSwapOpen(false)} />;
      })()}
      <View style={[styles.controls, { paddingBottom: insets.bottom + space.m }]}>
        {isRest ? (
          <IconButton icon="add" label="15 s" size={hit.control} onPress={() => { Haptics.selectionAsync().catch(() => {}); act((s) => plus(s, 15)); }} />
        ) : (
          <IconButton icon="play-skip-back" size={hit.control} onPress={() => { Haptics.selectionAsync().catch(() => {}); act(back); }} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); act(backBlock); }} />
        )}
        <IconButton icon={state.playing ? 'pause' : 'play'} size={hit.primary} primary onPress={() => { Haptics.selectionAsync().catch(() => {}); act((s) => (s.playing ? pause(s) : play(s))); }} />
        <IconButton icon="play-skip-forward" size={hit.control} onPress={() => { Haptics.selectionAsync().catch(() => {}); act(skip); }} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); act(skipBlock); }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.m, paddingBottom: space.s, gap: space.s },
  topEnd: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  swapBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: hit.min, paddingHorizontal: space.m, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  swapText: { ...type.caption, fontWeight: '700', color: colors.ink },
  progressText: { ...type.caption, color: colors.muted, fontVariant: ['tabular-nums'] },
  sectionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: hit.min, borderRadius: radius.pill, backgroundColor: colors.surface },
  sectionArrow: { width: 36, height: hit.min, alignItems: 'center', justifyContent: 'center' },
  blockText: { ...type.bodyStrong, color: colors.ink, flexShrink: 1 },
  progress: { height: 2, backgroundColor: colors.line, marginHorizontal: space.m, borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: 2, backgroundColor: colors.accent },
  stageWrap: { alignItems: 'center', paddingTop: space.m },
  stage: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.paper },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: space.m, paddingHorizontal: space.xl, gap: 2 },
  eyebrow: { ...type.label, color: colors.muted, textAlign: 'center' },
  exName: { ...type.h2, color: colors.ink, textAlign: 'center' },
  next: { fontSize: 20, lineHeight: 26, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: hit.gap, paddingHorizontal: space.l, paddingTop: space.s },
  doneTitle: { ...type.h1, color: colors.ink },
  doneMeta: { ...type.body, color: colors.muted },
  feedbackRow: { flexDirection: 'row', gap: space.s, alignSelf: 'stretch' },
});
