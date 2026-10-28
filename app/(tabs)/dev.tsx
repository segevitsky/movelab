import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { parseReel } from '../../src/capture/embed';
import { logFileUri, readLog, type CaptureAttempt } from '../../src/capture/log';
import { Pose } from '../../modules/pose';
import { ScreenRecorder } from '../../modules/screen-recorder';
import { Button } from '../../src/ui/Button';
import { db } from '../../src/db';
import { importLabReels } from '../../src/db/devImport';
import { colors, radius, shadow } from '../../src/ui/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function Section({ icon, title, children }: { icon: IoniconName; title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.section, shadow.card]}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={18} color={colors.accent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  return (
    <View style={styles.statusRow}>
      <Ionicons name={ok === null ? 'ellipse-outline' : ok ? 'checkmark-circle' : 'close-circle'} size={16} color={ok === null ? colors.muted : ok ? colors.success : colors.danger} />
      <Text style={styles.statusLabel}>{label}</Text>
      {detail ? <Text style={styles.statusDetail}>{detail}</Text> : null}
    </View>
  );
}

export default function DevHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { import: importParam } = useLocalSearchParams<{ import?: string }>();
  const [url, setUrl] = useState('');
  const [log, setLog] = useState<CaptureAttempt[]>([]);
  const [model, setModel] = useState<{ found: boolean; bytes: number; path: string | null } | null>(null);
  const [recAvailable, setRecAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    try { setModel(Pose.modelInfo()); } catch (e) { setModel({ found: false, bytes: 0, path: String(e) }); }
    try { setRecAvailable(ScreenRecorder.isAvailable()); } catch { setRecAvailable(false); }
  }, []);
  useEffect(() => {
    if (importParam === 'lab') importLabReels(db).then((n) => console.log(`dev: imported ${n} lab exercises`)).catch((e) => console.error('dev import failed', e));
  }, [importParam]);
  useFocusEffect(useCallback(() => { readLog().then(setLog); }, []));

  const openCapture = () => {
    const r = parseReel(url);
    if (!r) { Alert.alert('Not a reel URL', 'Paste something like https://www.instagram.com/reel/XXXX/'); return; }
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
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <Section icon="logo-instagram" title="Capture a reel">
        <TextInput style={styles.input} value={url} onChangeText={setUrl} placeholder="Paste a reel link…" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Button title="Open capture" onPress={openCapture} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Button title="Pick a video from Photos" onPress={pickVideo} secondary /></View>
          <View style={{ flex: 1 }}><Button title="Instagram login" onPress={() => router.push('/login')} secondary /></View>
        </View>
        <Text style={styles.hint}>Reel won't play? Log in once inside the app, then use "Open reel page (logged-in)".</Text>
      </Section>

      <Section icon="body-outline" title="Pose lab">
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Button title="Figure renderer" onPress={() => router.push('/figures')} secondary /></View>
          <View style={{ flex: 1 }}>
            <Button title="Import 3 lab reels" onPress={() => importLabReels(db).then((n) => Alert.alert('Imported', `${n} exercises added — see the Library tab`)).catch((e) => Alert.alert('Import failed', String(e)))} secondary />
          </View>
        </View>
      </Section>

      <Section icon="pulse-outline" title="Status">
        <StatusRow label="MediaPipe model" ok={model ? model.found : null} detail={model?.found ? `${(model.bytes / 1e6).toFixed(1)} MB` : model ? 'not found' : undefined} />
        <StatusRow label="ReplayKit" ok={recAvailable} detail={recAvailable ? 'available' : recAvailable === false ? 'unavailable' : undefined} />
      </Section>

      <Section icon="list-outline" title={`Reel log · ${log.length} tried`}>
        <Text style={styles.hint}>{embedOk} embedded · {videoOk} video found · {recOk} recorded</Text>
        {log.slice().reverse().map((l) => (
          <Pressable key={l.code} style={styles.logRow} onPress={() => router.push({ pathname: '/capture', params: { code: l.code, kind: 'reel', url: l.url } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.logTitle}>{l.username ? `@${l.username}` : l.code}</Text>
              <Text style={styles.mono}>
                embed {l.embedLoaded ? '✓' : '✗'} · video {l.videoFound ? '✓' : '✗'} · rec {l.recorded ? `✓ ${l.recordingSeconds?.toFixed(1) ?? ''}s` : '✗'}
                {l.mpDetectedPct != null ? ` · MP ${l.mpDetectedPct.toFixed(0)}% ${l.mpMs}ms` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        ))}
        {log.length > 0 && <Button title="Share reel log (JSON)" onPress={shareLog} secondary />}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, backgroundColor: colors.bg },
  section: { backgroundColor: colors.surface, borderRadius: radius.l, padding: 14, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.m, padding: 11, fontSize: 15, backgroundColor: colors.bg, color: colors.ink },
  row: { flexDirection: 'row', gap: 8 },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusLabel: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  statusDetail: { fontSize: 12, color: colors.muted, marginLeft: 'auto' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  logTitle: { fontWeight: '600', color: colors.ink },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: colors.muted },
});
