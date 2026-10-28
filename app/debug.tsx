import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Pose, type NormRect, type PoseResult } from '../modules/pose';
import { PoseOverlay } from '../src/debug/PoseOverlay';
import { patchAttempt } from '../src/capture/log';
import { Button } from '../src/ui/Button';

/** Phase 0 task 7: raw joints over a frame + JSON export. Also runs MediaPipe vs Vision timing. */
export default function Debug() {
  const { uri, title, code, crop: cropParam } = useLocalSearchParams<{ uri: string; title?: string; code?: string; crop?: string }>();
  const crop: NormRect | undefined = useMemo(() => (cropParam ? JSON.parse(cropParam) : undefined), [cropParam]);
  const [useCrop, setUseCrop] = useState(!!crop);
  const [gpu, setGpu] = useState(false);
  const [fps15, setFps15] = useState(false);
  const [info, setInfo] = useState<{ duration: number; width: number; height: number; fps: number } | null>(null);
  const [mp, setMp] = useState<PoseResult | null>(null);
  const [vision, setVision] = useState<PoseResult | null>(null);
  const [show, setShow] = useState<'mediapipe' | 'vision'>('mediapipe');
  const [progress, setProgress] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState(0);
  const [frameImg, setFrameImg] = useState<{ uri: string; width: number; height: number } | null>(null);
  const seq = useRef(0);

  const cropRect = useCrop ? crop : undefined;

  useEffect(() => {
    Pose.videoInfo(uri).then(setInfo).catch((e) => Alert.alert('videoInfo failed', String(e)));
  }, [uri]);

  useEffect(() => {
    const sub = Pose.addListener('progress', (e) => setProgress(`${e.done}/${e.total} frames · ${e.detected} detected`));
    return () => sub.remove();
  }, []);

  // load the frame image when t or crop changes
  useEffect(() => {
    const my = ++seq.current;
    Pose.frameImage(uri, t, { cropRect, maxSide: 720 })
      .then((r) => { if (my === seq.current) setFrameImg(r); })
      .catch(() => {});
  }, [uri, t, useCrop]);

  const run = async (which: 'mediapipe' | 'vision') => {
    setBusy(true);
    setProgress('starting…');
    const opts = { cropRect, targetFps: fps15 ? 15 : 30, delegate: gpu ? ('gpu' as const) : ('cpu' as const) };
    try {
      const t0 = Date.now();
      const res = which === 'mediapipe' ? await Pose.process(uri, opts) : await Pose.processVision(uri, opts);
      const wall = Date.now() - t0;
      (which === 'mediapipe' ? setMp : setVision)(res);
      setShow(which);
      const pct = (100 * res.stats.detected) / Math.max(1, res.stats.frames);
      setProgress(`${which}: ${res.stats.detected}/${res.stats.frames} = ${pct.toFixed(1)} % · ${res.stats.ms} ms (${res.stats.msPerFrame} ms/frame) · wall ${wall} ms`);
      if (code) {
        await patchAttempt(code, which === 'mediapipe' ? { mpDetectedPct: pct, mpMs: res.stats.ms } : { visionDetectedPct: pct, visionMs: res.stats.ms });
      }
    } catch (e) {
      Alert.alert(`${which} failed`, String(e));
      setProgress(String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportJson = async (res: PoseResult | null) => {
    if (!res) return;
    const name = `pose-${res.source}-${(title ?? 'video').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40)}-${Date.now()}.json`;
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    await f.write(JSON.stringify({ title, uri, crop: cropRect ?? null, ...res }));
    await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: name });
  };

  const shareFrame = async () => {
    if (!frameImg) return;
    await Sharing.shareAsync(frameImg.uri, { mimeType: 'image/jpeg', dialogTitle: `frame @ ${t.toFixed(2)}s` });
  };

  const deleteVideo = () => {
    Alert.alert('Delete recording?', uri, [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { try { new File(uri).delete(); Alert.alert('Deleted'); } catch (e) { Alert.alert('Failed', String(e)); } } },
    ]);
  };

  const res = show === 'mediapipe' ? mp : vision;
  const frame = useMemo(() => {
    if (!res) return null;
    // nearest frame by time
    let best = res.frames[0];
    let bd = Infinity;
    for (const f of res.frames) {
      const d = Math.abs(f.t - t);
      if (d < bd) { bd = d; best = f; }
    }
    return best ?? null;
  }, [res, t]);

  const W = Dimensions.get('window').width;
  // canvas follows the frame's aspect (capped), so a cropped landscape or portrait frame both fit
  const aspect = frameImg && frameImg.width > 0 ? frameImg.height / frameImg.width : 1.25;
  const H = Math.round(W * Math.min(1.4, Math.max(0.6, aspect)));
  const dur = info?.duration ?? 0;
  const step = info?.fps ? 1 / info.fps : 1 / 30;
  const clampT = (x: number) => Math.max(0, Math.min(Math.max(0, dur - step), x));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 80 }} contentInsetAdjustmentBehavior="automatic">
      <PoseOverlay imageUri={frameImg?.uri ?? null} imageW={frameImg?.width ?? 0} imageH={frameImg?.height ?? 0} srcW={res?.width ?? 0} srcH={res?.height ?? 0} frame={frame} width={W} height={H} />
      <View style={{ padding: 12, gap: 8 }}>
        <Text style={styles.mono}>
          {title}
          {'\n'}{info ? `${info.width}×${info.height} · ${info.duration.toFixed(2)} s · ${info.fps.toFixed(1)} fps` : '…'} · t = {t.toFixed(2)} s
          {frame ? ` · frame t=${frame.t.toFixed(3)} ${frame.xy ? 'person' : 'no person'}` : ''}
          {'\n'}{progress}
        </Text>
        <View style={styles.row}>
          <Button title="⟪ 1 s" onPress={() => setT(clampT(t - 1))} secondary />
          <Button title="‹ frame" onPress={() => setT(clampT(t - step))} secondary />
          <Button title="frame ›" onPress={() => setT(clampT(t + step))} secondary />
          <Button title="1 s ⟫" onPress={() => setT(clampT(t + 1))} secondary />
        </View>
        <View style={styles.row}>
          {[0, 0.25, 0.5, 0.75].map((k) => (
            <Button key={k} title={`${Math.round(k * 100)} %`} onPress={() => setT(clampT(dur * k))} secondary />
          ))}
        </View>
        <View style={styles.toggles}>
          <Toggle label={`crop to video rect${crop ? '' : ' (none)'}`} value={useCrop} onChange={setUseCrop} disabled={!crop} />
          <Toggle label="GPU delegate" value={gpu} onChange={setGpu} />
          <Toggle label="15 fps" value={fps15} onChange={setFps15} />
        </View>
        <Button title={busy ? 'running…' : 'Run MediaPipe (heavy)'} onPress={() => run('mediapipe')} disabled={busy} />
        <Button title={busy ? 'running…' : 'Run Apple Vision (2D)'} onPress={() => run('vision')} disabled={busy} secondary />
        {busy && <Button title="Cancel" onPress={() => Pose.cancel()} secondary />}
        {mp && vision && (
          <View style={styles.row}>
            <Button title={`show MediaPipe${show === 'mediapipe' ? ' ✓' : ''}`} onPress={() => setShow('mediapipe')} secondary />
            <Button title={`show Vision${show === 'vision' ? ' ✓' : ''}`} onPress={() => setShow('vision')} secondary />
          </View>
        )}
        {(mp || vision) && (
          <Text style={styles.mono}>
            {mp ? `MediaPipe: ${mp.stats.detected}/${mp.stats.frames} (${((100 * mp.stats.detected) / Math.max(1, mp.stats.frames)).toFixed(1)} %) · ${mp.stats.ms} ms · ${mp.stats.msPerFrame} ms/frame · infer ${mp.stats.inferMs} ms · init ${mp.stats.initMs} ms · ${mp.delegate} · ${mp.width}×${mp.height} · ${mp.stats.device}\n` : ''}
            {vision ? `Vision: ${vision.stats.detected}/${vision.stats.frames} (${((100 * vision.stats.detected) / Math.max(1, vision.stats.frames)).toFixed(1)} %) · ${vision.stats.ms} ms · ${vision.stats.msPerFrame} ms/frame` : ''}
          </Text>
        )}
        <View style={styles.row}>
          <Button title="Export MP JSON" onPress={() => exportJson(mp)} disabled={!mp} secondary />
          <Button title="Export Vision JSON" onPress={() => exportJson(vision)} disabled={!vision} secondary />
        </View>
        <View style={styles.row}>
          <Button title="Share this frame (JPEG)" onPress={shareFrame} disabled={!frameImg} secondary />
          <Button title="Delete video" onPress={deleteVideo} secondary />
        </View>
        <Text style={styles.small}>{uri}</Text>
      </View>
    </ScrollView>
  );
}

function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
      <Text style={{ fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: 'Menlo', fontSize: 11, color: '#333' },
  small: { fontSize: 10, color: '#888' },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
