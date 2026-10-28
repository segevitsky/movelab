import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { sql } from 'drizzle-orm';
import { db, useDbMigrations } from '../src/db';
import { seedIfNeeded } from '../src/db/seed';
import { importLabReels } from '../src/db/devImport';
import Constants from 'expo-constants';

export default function Layout() {
  const { success, error } = useDbMigrations();
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    console.log(`db: migrations success=${success} error=${error ? String(error) : 'none'}`);
    if (success) {
      seedIfNeeded(db)
        .then(async () => {
          const tables = await db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`);
          console.log(`db: seeded; tables = ${tables.map((t) => t.name).join(', ')}`);
          // simulator only (no capture possible there): fill an empty library with the 3 lab reels
          if (__DEV__ && !Constants.isDevice) {
            const n = await db.all<{ c: number }>(sql`select count(*) as c from exercise`);
            if (n[0]?.c === 0) console.log(`dev: simulator auto-import → ${await importLabReels(db)} exercises`);
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
    <Stack screenOptions={{ headerTitleStyle: { fontSize: 16 }, headerTransparent: false, headerShadowVisible: true, headerStyle: { backgroundColor: '#fff' }, contentStyle: { backgroundColor: '#fafafa' } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise' }} />
      <Stack.Screen name="exercise/new" options={{ title: 'New exercise', presentation: 'modal' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture' }} />
      <Stack.Screen name="debug" options={{ title: 'Pose debug' }} />
      <Stack.Screen name="login" options={{ title: 'Instagram login (your session)' }} />
      <Stack.Screen name="figures" options={{ title: 'Figure renderer (Phase 2)' }} />
    </Stack>
  );
}
