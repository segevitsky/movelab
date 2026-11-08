import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../src/db';
import { describePackage, type WorkoutPackage } from '../src/db/workoutPackage';
import { importWorkoutPackage } from '../src/db/workoutTransfer';
import { readWorkoutFile } from '../src/export/workoutFile';
import { Button } from '../src/ui/Button';
import { Card, Screen } from '../src/ui/primitives';
import { colors, space, type } from '../src/ui/theme';

/** A workout file was opened with MoveLab: show what is inside, then import it into the library + Recent. */
export default function ImportWorkout() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router = useRouter();
  const [pkg, setPkg] = useState<WorkoutPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPkg(null); setError(null);
    if (!uri) { setError('No file'); return; }
    readWorkoutFile(uri).then(setPkg).catch((e) => setError(String(e?.message ?? e)));
  }, [uri]);

  const doImport = async () => {
    if (!pkg) return;
    setBusy(true);
    try {
      const r = await importWorkoutPackage(db, pkg);
      const parts = [r.exercisesAdded ? `${r.exercisesAdded} new exercise${r.exercisesAdded === 1 ? '' : 's'}` : null, r.exercisesUpdated ? `${r.exercisesUpdated} updated` : null, r.exercisesKept ? `${r.exercisesKept} already here` : null].filter(Boolean).join(' · ');
      Alert.alert(r.replacedWorkout ? 'Workout updated' : 'Workout added', parts || 'Saved to Recent.', [{ text: 'Open', onPress: () => router.replace({ pathname: '/workout/[id]', params: { id: r.workoutId } }) }]);
    } catch (e) {
      Alert.alert('Import failed', String(e));
    } finally { setBusy(false); }
  };

  const d = pkg ? describePackage(pkg) : null;
  return (
    <Screen scroll contentStyle={{ gap: space.m, padding: space.l }} footer={d ? <Button title={busy ? 'Importing…' : 'Add to my workouts'} size="l" icon="download-outline" disabled={busy} onPress={doImport} /> : undefined}>
      {!pkg && !error && <View style={styles.center}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Reading the file…</Text></View>}
      {error && (
        <Card>
          <Text style={styles.title}>Can't open this file</Text>
          <Text style={styles.muted}>{error}</Text>
          <Button title="Back" secondary onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))} />
        </Card>
      )}
      {d && pkg && (
        <>
          <View style={{ alignItems: 'center', gap: space.s, paddingVertical: space.l }}>
            <Ionicons name="gift-outline" size={40} color={colors.accent} />
            <Text style={styles.eyebrow}>{pkg.sender ? `${pkg.sender} sent you a workout` : 'A workout was shared with you'}</Text>
            <Text style={styles.title}>{d.name}</Text>
            <Text style={styles.muted}>{d.sections} section{d.sections === 1 ? '' : 's'} · {d.drills} drill{d.drills === 1 ? '' : 's'} · {d.exercises} exercise{d.exercises === 1 ? '' : 's'}</Text>
          </View>
          <Card>
            {d.drillNames.map((n, i) => <Text key={i} style={styles.row} numberOfLines={1}>• {n}</Text>)}
          </Card>
          <Text style={styles.muted}>The exercises join your library as stick figures (no video). The workout appears under Recent; sending it again replaces this copy.</Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.m, paddingTop: 80 },
  eyebrow: { ...type.label, color: colors.accent },
  title: { ...type.h1, color: colors.ink, textAlign: 'center' },
  muted: { ...type.caption, color: colors.muted, textAlign: 'center' },
  row: { ...type.body, color: colors.ink, paddingVertical: 4 },
});
