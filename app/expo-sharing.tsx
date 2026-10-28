import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { parseReel } from '../src/capture/embed';
import { colors } from '../src/ui/theme';

/** Target of the share extension's deep link (movelab:///expo-sharing): route the payload and leave. */
export default function ExpoSharingRoute() {
  const router = useRouter();
  useEffect(() => {
    let payloads: ReturnType<typeof Sharing.getSharedPayloads> = [];
    try { payloads = Sharing.getSharedPayloads(); } catch {}
    try { Sharing.clearSharedPayloads(); } catch {}
    const p = payloads[0];
    const val = p ? String(p.value ?? '') : '';
    const reel = val ? parseReel(val) : null;
    const t = setTimeout(() => {
      if (reel) router.replace({ pathname: '/capture', params: { code: reel.code, kind: reel.kind, url: val } });
      else if (p && (p.shareType === 'video' || p.shareType === 'file' || /\.(mp4|mov)$/i.test(val))) router.replace({ pathname: '/review', params: { uri: val, title: 'shared video' } });
      else router.replace('/library');
    }, 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 10 }}>
      <ActivityIndicator color={colors.accent} />
      <Text style={{ color: colors.muted }}>Opening the shared reel…</Text>
    </View>
  );
}
