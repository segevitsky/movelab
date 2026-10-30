import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'react-native';
import { File } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { Pose, type NormRect } from '../modules/pose';
import { db } from '../src/db';
import { exerciseFromProcessed, insertExercise, linkSource } from '../src/db/repo';
import type { Scene } from '../src/db/types';
import { EQUIPMENT, PATTERNS, SLOTS, type Equipment, type Pattern, type Slot } from '../src/db/vocab';
import { FigureCard, clipFromProcessed } from '../src/figure';
import { frameAt, mergeRanges, processRange, splitRange, trimRange, type Range } from '../src/pipeline/edit';
import { estimateFps, resample } from '../src/pipeline/resample';
import { segment } from '../src/pipeline/segment';
import { suggestName, suggestTags, type TagSuggestion } from '../src/pipeline/tagger';
import { validateMatQuad } from '../src/pipeline/scene';
import { qualityScore } from '../src/pipeline/sanity';
import type { ProcessedSegment, RawFrame } from '../src/pipeline';
import { Button, Chip, Tag } from '../src/ui/Button';
import { colors, patternColor, radius, shadow, slotColor } from '../src/ui/theme';
import { Drop } from '../src/ui/motion';

type Item = {
  id: string;
  range: Range;
  processed: ProcessedSegment;
  suggestion: TagSuggestion;
  name: string;
  pattern: Pattern | null;
  slots: Slot[];
  equipment: Equipment[];
  include: boolean;
  editTags: boolean;
  splitT: number; // seconds, for the split control
};

type Phase = 'scene' | 'pose' | 'pipeline' | 'review' | 'saving' | 'error';

/**
 * Phase 4: recording (or picked video) → scene analysis → MediaPipe → TS pipeline → one row per
 * exercise → confirm → saved to the library. The video is deleted after saving or discarding.
 */
export default function Review() {
  const params = useLocalSearchParams<{ uri: string; title?: string; code?: string; url?: string; username?: string; caption?: string; crop?: string }>();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('scene');
  const [progress, setProgress] = useState('Looking at the recording…');
  const [scene, setScene] = useState<Scene | null>(null);
  const [frames, setFrames] = useState<RawFrame[]>([]);
  const [fps, setFps] = useState(30);
  const [items, setItems] = useState<Item[]>([]);
  const [matEditor, setMatEditor] = useState(false);
  const [stats, setStats] = useState('');
  const cropRef = useRef<NormRect | undefined>(params.crop ? JSON.parse(params.crop) : undefined);
  const W = Dimensions.get('window').width;

  useEffect(() => {
    const sub = Pose.addListener('progress', (e) => setProgress(`Finding the skeleton… ${e.done}/${e.total} frames`));
    run().catch((e) => { setPhase('error'); setProgress(String(e)); });
    return () => sub.remove();
  }, []);

  async function run() {
    // 1. scene: auto-crop + mat
    const sc = await Pose.sceneAnalysis(params.uri);
    const crop: NormRect | undefined = cropRef.current ?? sc.cropRect;
    cropRef.current = crop;
    const cx = crop ? crop.x * sc.width : 0;
    const cy = crop ? crop.y * sc.height : 0;
    const matQuad = sc.matQuad ? (sc.matQuad.map(([x, y]) => [x - cx, y - cy]) as Scene['matQuad']) : undefined;
    const s: Scene = { matQuad, cropRect: crop, cameraStatic: sc.cameraStatic };
    setScene(s);
    // 2. pose
    setPhase('pose');
    const res = await Pose.process(params.uri, { cropRect: crop, delegate: 'gpu', targetFps: 30 });
    setStats(`${res.stats.detected}/${res.stats.frames} frames with a person · ${(res.stats.ms / 1000).toFixed(1)} s · ${res.width}×${res.height}${sc.matQuad ? ' · mat found' : ''}${crop ? ' · cropped' : ''}`);
    // 3. pipeline
    setPhase('pipeline');
    setProgress('Splitting into exercises…');
    const raw = res.frames;
    const f0 = estimateFps(raw);
    const rs = Math.abs(f0 - 30) > 1 ? resample(raw, 30) : raw;
    const fpsUsed = Math.abs(f0 - 30) > 1 ? 30 : f0;
    setFrames(rs);
    setFps(fpsUsed);
    const segs = segment(rs);
    const built = segs.map((sg, i) => makeItem(rs, { start: sg.start, end: sg.end }, fpsUsed, i));
    // the detector can mistake a uniform background for a mat: keep the quad only if it sits on the floor under the figure
    if (s.matQuad && built.length) {
      const ok = validateMatQuad(s.matQuad, built.reduce((a, b) => (b.processed.xy.length > a.processed.xy.length ? b : a)).processed.xyFull);
      if (!ok) setScene({ ...s, matQuad: undefined });
      setStats((st) => st.replace(' · mat found', ok ? ' · mat found' : ' · mat rejected (not on the floor)'));
    }
    setItems(built);
    setPhase('review');
  }

  function makeItem(fr: RawFrame[], range: Range, fpsUsed: number, index: number, prev?: Partial<Item>): Item {
    const processed = processRange(fr, range, fpsUsed);
    const suggestion = suggestTags({ xy: processed.xyFull, features: processed.features, periodSeconds: processed.period?.periodic ? processed.period.period : null, caption: params.caption ?? null, username: params.username ?? null });
    return {
      id: `${range.start}-${range.end}-${Math.random().toString(36).slice(2, 6)}`,
      range,
      processed,
      suggestion,
      name: prev?.name ?? suggestName(suggestion, index, params.username),
      pattern: prev?.pattern ?? suggestion.pattern ?? null,
      slots: prev?.slots ?? suggestion.slots,
      equipment: prev?.equipment ?? suggestion.equipment,
      include: prev?.include ?? true,
      editTags: false,
      splitT: (fr[range.start].t + fr[range.end].t) / 2,
    };
  }

  const update = (id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  const mergeWithNext = (idx: number) => {
    const a = items[idx], b = items[idx + 1];
    if (!b) return;
    const merged = makeItem(frames, mergeRanges(a.range, b.range), fps, idx, { name: a.name, include: a.include });
    setItems((xs) => [...xs.slice(0, idx), merged, ...xs.slice(idx + 2)]);
  };
  const split = (idx: number) => {
    const it = items[idx];
    const at = frameAt(frames, it.splitT, it.range);
    const halves = splitRange(it.range, at);
    if (!halves) { Alert.alert('Too short to split', 'Each part needs at least half a second.'); return; }
    const a = makeItem(frames, halves[0], fps, idx, { name: it.name, include: it.include });
    const b = makeItem(frames, halves[1], fps, idx + 1);
    setItems((xs) => [...xs.slice(0, idx), a, b, ...xs.slice(idx + 1)]);
  };
  const trim = (idx: number, startDelta: number, endDelta: number) => {
    const it = items[idx];
    const s = frameAt(frames, frames[it.range.start].t + startDelta, { start: 0, end: frames.length - 1 });
    const e = frameAt(frames, frames[it.range.end].t + endDelta, { start: 0, end: frames.length - 1 });
    const r = trimRange({ start: 0, end: frames.length - 1 }, s, e);
    if (!r || r.end - r.start < 15) { Alert.alert('Too short'); return; }
    setItems((xs) => xs.map((x, i) => (i === idx ? makeItem(frames, r, fps, idx, x) : x)));
  };

  const deleteVideo = () => { try { new File(params.uri).delete(); } catch {} };

  const save = async () => {
    const chosen = items.filter((i) => i.include);
    if (chosen.length === 0) { Alert.alert('Nothing selected', 'Tick at least one exercise, or discard.'); return; }
    setPhase('saving');
    try {
      const ids: string[] = [];
      for (const it of chosen) {
        const row = exerciseFromProcessed(it.processed, { name: it.name.trim() || 'Exercise', pattern: it.pattern, slots: it.slots, equipment: it.equipment, intensity: 'medium', dosageDefault: it.suggestion.dosage, scene: scene ?? undefined });
        await insertExercise(db, row);
        ids.push(row.id);
      }
      if (params.url) await linkSource(db, { url: params.url, coach: params.username ?? null, caption: params.caption ?? null, exerciseIds: ids, ranges: chosen.map((c) => ({ startSec: c.processed.segment.t0, endSec: c.processed.segment.t1 })) });
      deleteVideo();
      if (router.canDismiss?.()) router.dismissAll();
      router.replace('/library');
    } catch (e) {
      setPhase('review');
      Alert.alert('Save failed', String(e));
    }
  };

  const discard = () => Alert.alert('Discard this capture?', 'The recording is deleted.', [{ text: 'Keep' }, { text: 'Discard', style: 'destructive', onPress: () => { deleteVideo(); if (router.canDismiss?.()) router.dismissAll(); router.replace('/library'); } }]);

  if (phase !== 'review' && phase !== 'saving') {
    return (
      <View style={styles.center}>
        {phase !== 'error' ? <ActivityIndicator size="large" color={colors.accent} /> : <Ionicons name="alert-circle" size={36} color={colors.danger} />}
        <Text style={styles.progress}>{progress}</Text>
        <Text style={styles.small}>{phase === 'scene' ? 'auto-crop + floor mat' : phase === 'pose' ? 'MediaPipe on the GPU' : phase === 'pipeline' ? 'cuts · cleaning · reps · feet' : ''}</Text>
        {phase === 'error' && (
          <View style={{ gap: 8, width: '100%' }}>
            <Button title="Open in pose debug" onPress={() => router.push({ pathname: '/debug', params: { uri: params.uri, title: params.title ?? params.code ?? 'video', crop: cropRef.current ? JSON.stringify(cropRef.current) : '' } })} secondary />
            <Button title="Discard" onPress={discard} danger />
          </View>
        )}
      </View>
    );
  }

  const cardW = Math.min(150, Math.round(W * 0.36));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Found {items.length} exercise{items.length === 1 ? '' : 's'}{params.username ? ` from @${params.username}` : ''}</Text>
        <Text style={styles.small}>{stats}</Text>
        {scene && !scene.matQuad && scene.cameraStatic && (
          <Pressable onPress={() => setMatEditor(true)} style={styles.matHint}><Ionicons name="square-outline" size={14} color={colors.accent} /><Text style={styles.matHintText}>No mat detected — tap to mark its 4 corners (optional)</Text></Pressable>
        )}
        {scene?.matQuad && (
          <Pressable onPress={() => setMatEditor(true)} style={styles.matHint}><Ionicons name="checkbox-outline" size={14} color={colors.success} /><Text style={styles.matHintText}>Mat detected · tap to adjust</Text></Pressable>
        )}
        {items.length === 0 && <Text style={styles.small}>No person found for long enough. Try "Open in pose debug" to look at the frames.</Text>}
        {items.map((it, idx) => {
          const clip = clipFromProcessed(it.processed);
          if (scene?.matQuad) clip.scene = { ...clip.scene, matQuad: scene.matQuad.map((p) => [p[0], p[1]]) };
          const t0 = frames[it.range.start].t, t1 = frames[it.range.end].t;
          return (
            <Drop key={it.id} index={idx} style={[styles.card, shadow.card, !it.include && { opacity: 0.55 }]}>
              <View style={styles.cardRow}>
                <View style={{ borderRadius: radius.m, overflow: 'hidden' }}>
                  <FigureCard clip={clip} width={cardW} height={Math.round(cardW * 1.2)} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <TextInput style={styles.name} value={it.name} onChangeText={(v) => update(it.id, { name: v })} placeholder="Name" />
                  <Text style={styles.small}>{t0.toFixed(1)}–{t1.toFixed(1)} s · {(t1 - t0).toFixed(1)} s{it.processed.period?.periodic ? ` · ${it.processed.period.period.toFixed(1)} s/rep` : ' · hold / flow'}</Text>
                  <View style={styles.tagRow}>
                    {it.pattern && <Tag label={it.pattern} color={patternColor[it.pattern]} />}
                    {it.slots.filter((s) => s !== it.pattern).map((s) => <Tag key={s} label={s} color={slotColor[s] ?? colors.muted} />)}
                    {it.equipment.map((e) => <Tag key={e} label={e} />)}
                  </View>
                  {(() => { const q = qualityScore(it.processed.xy, it.processed.issues); const pct = Math.round(q.score * 100); return (
                    <Text style={[styles.reason, pct < 70 && { color: colors.danger, fontStyle: 'normal', fontWeight: '700' }]}>
                      {pct >= 90 ? 'tracking: good' : pct >= 70 ? `tracking: ok (${pct} %)` : `tracking: poor (${pct} %) — consider trimming or deleting`}
                      {q.unknownFrames ? ` · ${q.unknownFrames} frames with hidden limbs` : ''}
                    </Text>
                  ); })()}
                  <Text style={styles.reason} numberOfLines={2}>{it.suggestion.reasons.slice(0, 2).join(' · ')}</Text>
                  <View style={styles.row}>
                    <Pressable onPress={() => update(it.id, { editTags: !it.editTags })} style={styles.linkBtn}><Text style={styles.link}>{it.editTags ? 'Hide tags' : 'Edit tags'}</Text></Pressable>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}><Text style={styles.small}>add</Text><Switch value={it.include} onValueChange={(v) => update(it.id, { include: v })} /></View>
                  </View>
                </View>
              </View>
              {it.editTags && (
                <View style={{ gap: 6 }}>
                  <View style={styles.chips}>{PATTERNS.map((p) => <Chip key={p} label={p} color={patternColor[p]} on={it.pattern === p} onPress={() => update(it.id, { pattern: it.pattern === p ? null : p })} />)}</View>
                  <View style={styles.chips}>{SLOTS.map((s) => <Chip key={s} label={s} color={slotColor[s] ?? colors.inkSoft} on={it.slots.includes(s)} onPress={() => update(it.id, { slots: it.slots.includes(s) ? it.slots.filter((x) => x !== s) : [...it.slots, s] })} />)}</View>
                  <View style={styles.chips}>{EQUIPMENT.filter((e) => e !== 'none').map((e) => <Chip key={e} label={e} color={colors.muted} on={it.equipment.includes(e)} onPress={() => update(it.id, { equipment: it.equipment.includes(e) ? it.equipment.filter((x) => x !== e) : [...it.equipment, e] })} />)}</View>
                </View>
              )}
              <View style={styles.actions}>
                <Action icon="cut-outline" label={`Split @ ${it.splitT.toFixed(1)}s`} onPress={() => split(idx)} />
                <Action icon="remove" label="" onPress={() => update(it.id, { splitT: Math.max(t0 + 0.5, it.splitT - 0.5) })} />
                <Action icon="add" label="" onPress={() => update(it.id, { splitT: Math.min(t1 - 0.5, it.splitT + 0.5) })} />
                {idx < items.length - 1 && <Action icon="git-merge-outline" label="Merge ↓" onPress={() => mergeWithNext(idx)} />}
                <Action icon="play-skip-forward-outline" label="Start +0.5s" onPress={() => trim(idx, 0.5, 0)} />
                <Action icon="play-skip-back-outline" label="End −0.5s" onPress={() => trim(idx, 0, -0.5)} />
                <Action icon="trash-outline" label="Delete" onPress={() => remove(it.id)} danger />
              </View>
            </Drop>
          );
        })}
        <Button title="Open in pose debug" onPress={() => router.push({ pathname: '/debug', params: { uri: params.uri, title: params.title ?? params.code ?? 'video', crop: cropRef.current ? JSON.stringify(cropRef.current) : '' } })} secondary />
      </ScrollView>
      <View style={styles.footer}>
        <View style={{ flex: 1 }}><Button title="Discard" onPress={discard} secondary /></View>
        <View style={{ flex: 2 }}><Button title={phase === 'saving' ? 'Saving…' : `Add ${items.filter((i) => i.include).length} to library`} onPress={save} disabled={phase === 'saving'} /></View>
      </View>
      {matEditor && <MatEditor uri={params.uri} crop={cropRef.current} initial={scene?.matQuad} onDone={(q) => { setScene((s) => (s ? { ...s, matQuad: q } : s)); setMatEditor(false); }} onCancel={() => setMatEditor(false)} />}
    </View>
  );
}

function Action({ icon, label, onPress, danger }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Ionicons name={icon} size={14} color={danger ? colors.danger : colors.inkSoft} />
      {label ? <Text style={[styles.actionText, danger && { color: colors.danger }]}>{label}</Text> : null}
    </Pressable>
  );
}

/** Fallback for Arch §5a: tap the 4 mat corners on a frame (TL, TR, BR, BL). Coordinates in crop px. */
function MatEditor({ uri, crop, initial, onDone, onCancel }: { uri: string; crop?: NormRect; initial?: Scene['matQuad']; onDone: (q: Scene['matQuad']) => void; onCancel: () => void }) {
  const [img, setImg] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [pts, setPts] = useState<[number, number][]>(initial ? initial.map((p) => [p[0], p[1]]) : []);
  const [t, setT] = useState(1.0);
  const W = Dimensions.get('window').width - 32;
  useEffect(() => { Pose.frameImage(uri, t, { cropRect: crop, maxSide: 900 }).then(setImg).catch(() => {}); }, [t]);
  const scale = img ? W / img.width : 1;
  const H = img ? Math.round(img.height * scale) : Math.round(W * 1.3);
  // the preview JPEG is downscaled; convert its px back to the pose/crop px space
  const toCropPx = (x: number, y: number): [number, number] => [x / scale, y / scale];
  const labels = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  return (
    <Modal animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.center, { justifyContent: 'flex-start', paddingTop: 60 }]}>
        <Text style={styles.h1}>Mark the mat corners</Text>
        <Text style={styles.small}>Tap {pts.length < 4 ? labels[pts.length] : 'done — or reset'} · frame at {t.toFixed(1)} s</Text>
        <Pressable
          onPress={(e) => { if (pts.length < 4) setPts([...pts, toCropPx(e.nativeEvent.locationX, e.nativeEvent.locationY)]); }}
          style={{ width: W, height: H, backgroundColor: '#111', borderRadius: radius.m, overflow: 'hidden' }}
        >
          {img && <Image source={{ uri: img.uri }} style={{ width: W, height: H }} />}
          {pts.map((p, i) => (
            <View key={i} style={{ position: 'absolute', left: p[0] * scale - 8, top: p[1] * scale - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff' }} />
          ))}
        </Pressable>
        <View style={styles.row}>
          <Button title="−1 s" onPress={() => setT(Math.max(0, t - 1))} secondary />
          <Button title="+1 s" onPress={() => setT(t + 1)} secondary />
          <Button title="Reset" onPress={() => setPts([])} secondary />
        </View>
        <View style={[styles.row, { width: '100%' }]}>
          <View style={{ flex: 1 }}><Button title="Cancel" onPress={onCancel} secondary /></View>
          <View style={{ flex: 1 }}><Button title="No mat" onPress={() => onDone(undefined)} secondary /></View>
          <View style={{ flex: 1 }}><Button title="Use" onPress={() => pts.length === 4 && onDone(pts as Scene['matQuad'])} disabled={pts.length !== 4} /></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg },
  progress: { fontSize: 16, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  container: { padding: 16, gap: 12, paddingBottom: 120 },
  h1: { fontSize: 20, fontWeight: '800', color: colors.ink },
  small: { fontSize: 12, color: colors.muted },
  reason: { fontSize: 11, color: colors.muted, fontStyle: 'italic' },
  card: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 10, gap: 8 },
  cardRow: { flexDirection: 'row', gap: 10 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  actionText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  linkBtn: { paddingVertical: 4 },
  link: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  matHint: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, padding: 8, borderRadius: radius.s },
  matHintText: { fontSize: 12, color: colors.ink },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
});
