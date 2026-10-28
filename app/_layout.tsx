import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, I18nManager, Text, View } from 'react-native';

// The UI is English/LTR; on Hebrew devices iOS would mirror rows (close buttons end up on the far edge).
if (I18nManager.isRTL) { I18nManager.allowRTL(false); I18nManager.forceRTL(false); }
import { Stack, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { parseReel } from '../src/capture/embed';
import { sql } from 'drizzle-orm';
import { db, useDbMigrations } from '../src/db';
import { seedIfNeeded } from '../src/db/seed';
import { colors } from '../src/ui/theme';
import { importLabReels } from '../src/db/devImport';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';

/** Share sheet → app (expo-sharing "share into"): a reel link opens Capture, a video opens Review. */
function useSharedPayloads(enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const handle = () => {
      let payloads: ReturnType<typeof Sharing.getSharedPayloads> = [];
      try { payloads = Sharing.getSharedPayloads(); } catch { return; }
      if (!payloads.length) return;
      try { Sharing.clearSharedPayloads(); } catch {}
      const p = payloads[0];
      const val = String(p.value ?? '');
      const reel = parseReel(val);
      if (reel) {
        router.push({ pathname: '/capture', params: { code: reel.code, kind: reel.kind, url: val } });
      } else if (p.shareType === 'video' || p.shareType === 'file' || /\.(mp4|mov)$/i.test(val)) {
        router.push({ pathname: '/review', params: { uri: val, title: 'shared video' } });
      }
    };
    handle();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') handle(); });
    return () => sub.remove();
  }, [enabled]);
}

export default function Layout() {
  const router = useRouter();
  const { success, error } = useDbMigrations();
  const [seeded, setSeeded] = useState(false);
  useSharedPayloads(!!success && seeded);
  useEffect(() => {
    if (error) console.error('db: migration error', error);
    if (success) {
      seedIfNeeded(db)
        .then(async () => {
          const tables = await db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`);
          if (!(globalThis as any).__movelabDbLogged) { (globalThis as any).__movelabDbLogged = true; console.log(`db: ready; tables = ${tables.map((t) => t.name).join(', ')}`); }
          // simulator only (no capture possible there): fill an empty library with the 3 lab reels
          if (__DEV__ && !Constants.isDevice) {
            const n = await db.all<{ c: number }>(sql`select count(*) as c from exercise`);
            if (n[0]?.c === 0) console.log(`dev: simulator auto-import → ${await importLabReels(db)} exercises`);
            // drop a video at Documents/autoreview.mp4 (xcrun simctl … container) to open Review on launch
            const auto = new File(Paths.document, 'autoreview.mp4');
            if (auto.exists) setTimeout(() => router.push({ pathname: '/review', params: { uri: auto.uri, title: 'autoreview.mp4' } }), 800);
          }
          setSeeded(true);
        })
        .catch((e) => console.error('seed failed', e));
    }
  }, [success, error]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontWeight: '700' }}>Database migration failed</Text>
        <Text selectable>{String(error)}</Text>
      </View>
    );
  }
  if (!success || !seeded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 16, fontWeight: '700', color: colors.ink }, headerTintColor: colors.accent, headerTransparent: false, headerShadowVisible: false, headerStyle: { backgroundColor: colors.bg }, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise' }} />
      <Stack.Screen name="exercise/new" options={{ title: 'New exercise', presentation: 'modal' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture' }} />
      <Stack.Screen name="review" options={{ title: 'Review', headerBackVisible: false }} />
      <Stack.Screen name="expo-sharing" options={{ headerShown: false }} />
      <Stack.Screen name="frameworks/index" options={{ title: 'Frameworks' }} />
      <Stack.Screen name="frameworks/[id]" options={{ title: 'Edit framework' }} />
      <Stack.Screen name="player/[workoutId]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="debug" options={{ title: 'Pose debug' }} />
      <Stack.Screen name="login" options={{ title: 'Instagram login (your session)' }} />
      <Stack.Screen name="figures" options={{ title: 'Figure renderer (Phase 2)' }} />
    </Stack>
  );
}
