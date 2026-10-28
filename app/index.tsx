import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { parseReel } from '../src/capture/embed';
import { logFileUri, readLog, type CaptureAttempt } from '../src/capture/log';
import { Pose } from '../modules/pose';
import { ScreenRecorder } from '../modules/screen-recorder';

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [log, setLog] = useState<CaptureAttempt[]>([]);
  const [model, setModel] = useState<{ found: boolean; bytes: number; path: string | null } | null>(null);
  const [recAvailable, setRecAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setModel(Pose.modelInfo());
    } catch (e) {
      setModel({ found: false, bytes: 0, path: String(e) });
    }
    try {
      setRecAvailable(ScreenRecorder.isAvailable());
    } catch {
      setRecAvailable(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      readLog().then(setLog);
    }, []),
  );

  const openCapture = () => {
    const r = parseReel(url);
    if (!r) {
      Alert.alert('Not a reel URL', 'Paste something like https://www.instagram.com/reel/XXXX/');
      return;
    }
    router.push({ pathname: '/capture', params: { code: r.code, kind: r.kind, url } });
  };

  const pickVideo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    router.push({ pathname: '/debug', params: { uri: a.uri, title: a.fileName ?? 'photos video' } });
  };

  const shareLog = async () => {
    if (!(await Sharing.isAvailableAsync())) return;
    await Sharing.shareAsync(logFileUri(), { mimeType: 'application/json', dialogTitle: 'phase0-capture-log.json' });
  };

  const embedOk = log.filter((l) => l.embedLoaded).length;
  const videoOk = log.filter((l) => l.videoFound).length;
  const recOk = log.filter((l) => l.recorded).length;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: 24, paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <Text style={styles.h}>1 · Paste a reel URL</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="https://www.instagram.com/reel/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Button title="Open capture (embed + record)" onPress={openCapture} />

      <Text style={styles.h}>Reel won't play? Log in to Instagram inside the app (once)</Text>
      <Button title="Log in to Instagram (in-app, your own session)" onPress={() => router.push('/login')} secondary />

      <Text style={styles.h}>2 · Or pick a video from Photos</Text>
      <Button title="Pick a video from Photos" onPress={pickVideo} secondary />

      <Text style={styles.h}>Phase 2 · figure renderer</Text>
      <Button title="Figure dev screen (3 fixture cards)" onPress={() => router.push('/figures')} secondary />

      <Text style={styles.h}>Status</Text>
      <Text style={styles.mono}>
        model: {model ? (model.found ? `found, ${(model.bytes / 1e6).toFixed(1)} MB` : 'NOT FOUND') : '…'}
        {'\n'}ReplayKit available: {recAvailable === null ? '…' : String(recAvailable)}
      </Text>

      <Text style={styles.h}>
        Reel log · {log.length} tried · {embedOk} embedded · {videoOk} video found · {recOk} recorded
      </Text>
      {log
        .slice()
        .reverse()
        .map((l) => (
          <Pressable key={l.code} style={styles.row} onPress={() => router.push({ pathname: '/capture', params: { code: l.code, kind: 'reel', url: l.url } })}>
            <Text style={styles.rowTitle}>
              {l.code} {l.username ? `@${l.username}` : ''}
            </Text>
            <Text style={styles.mono}>
              embed {l.embedLoaded ? '✓' : '✗'} · video {l.videoFound ? '✓' : '✗'} · rec {l.recorded ? `✓ ${l.recordingSeconds?.toFixed(1) ?? ''}s` : '✗'}
              {l.mpDetectedPct != null ? ` · MP ${l.mpDetectedPct.toFixed(0)}% ${l.mpMs}ms` : ''}
              {l.visionDetectedPct != null ? ` · Vision ${l.visionDetectedPct.toFixed(0)}% ${l.visionMs}ms` : ''}
            </Text>
            {!!l.bodyText && !l.videoFound && <Text style={styles.small}>{l.bodyText}</Text>}
          </Pressable>
        ))}
      {log.length > 0 && <Button title="Share reel log (JSON)" onPress={shareLog} secondary />}
    </ScrollView>
  );
}

export function Button({ title, onPress, secondary, disabled }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.btn, secondary && styles.btnSecondary, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.btnText, secondary && { color: '#111' }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 60 },
  h: { fontWeight: '700', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#fff' },
  btn: { backgroundColor: '#111', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnSecondary: { backgroundColor: '#e8e8e8' },
  btnText: { color: '#fff', fontWeight: '600' },
  mono: { fontFamily: 'Menlo', fontSize: 12, color: '#333' },
  small: { fontSize: 11, color: '#777' },
  row: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', gap: 2 },
  rowTitle: { fontWeight: '600' },
});
