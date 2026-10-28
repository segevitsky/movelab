import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

// react-native-webview's class typings don't resolve under React 19.3 + TS 6; cast once.
const WebViewC = WebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebView> }>;
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DESKTOP_UA, EMBED_INJECTED_JS, embedUrl, reelPageUrl, type EmbedMessage } from '../src/capture/embed';
import { upsertAttempt, patchAttempt } from '../src/capture/log';
import { ScreenRecorder } from '../modules/screen-recorder';
import type { NormRect } from '../modules/pose';
import { Button } from '../src/ui/Button';

/**
 * Phase 0 task 3 + 4: embed WebView with injected JS, and ReplayKit recording around it.
 * The crop rect = the <video> rect (CSS px, assumed == points) offset by the WebView's window
 * position, normalised by the screen size (the recording covers the whole screen).
 */
export default function Capture() {
  const { code, kind, url } = useLocalSearchParams<{ code: string; kind: 'reel' | 'p'; url: string }>();
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const [mode, setMode] = useState<'embed' | 'page'>('embed');
  const [desktop, setDesktop] = useState(true);
  const [msg, setMsg] = useState<EmbedMessage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webFrame, setWebFrame] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastRect = useRef<NormRect | null>(null);
  const loggedVideo = useRef(false);
  const autoStopped = useRef(false);
  const webWrap = useRef<React.ComponentRef<typeof View>>(null);

  const src = mode === 'embed' ? embedUrl(code, kind ?? 'reel') : reelPageUrl(code, kind ?? 'reel');

  useEffect(() => {
    upsertAttempt({
      at: new Date().toISOString(), url: url ?? '', code, embedLoaded: false, videoFound: false,
      username: null, captionChars: 0, bodyText: '', recorded: false,
    });
  }, [code]);

  const measure = () => {
    webWrap.current?.measureInWindow((x, y, w, h) => setWebFrame({ x, y, w, h }));
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let m: EmbedMessage;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type !== 'embed') return;
    setMsg(m);
    if (m.video && webFrame) {
      const screen = Dimensions.get('screen');
      const r = m.video;
      // CSS px -> points: scale by webview width / viewport width (handles page zoom)
      const k = m.viewport.w > 0 ? webFrame.w / m.viewport.w : 1;
      lastRect.current = {
        x: (webFrame.x + r.x * k) / screen.width,
        y: (webFrame.y + r.y * k) / screen.height,
        width: (r.width * k) / screen.width,
        height: (r.height * k) / screen.height,
      };
    }
    if (m.video && !loggedVideo.current) {
      loggedVideo.current = true;
      patchAttempt(code, { videoFound: true, username: m.username, captionChars: m.caption?.length ?? 0, bodyText: m.bodyText, ua: desktop ? 'desktop' : 'mobile', mode });
    } else if (!m.video) {
      patchAttempt(code, { username: m.username, captionChars: m.caption?.length ?? 0, bodyText: m.bodyText });
    }
    if ((m.event === 'ended' || m.event === 'looped') && ScreenRecorder.isRecording() && !autoStopped.current) {
      autoStopped.current = true;
      stop(m.event === 'looped' ? 'one loop done' : 'video ended');
    }
  };

  const PLAY_JS = `(function(){var v=document.querySelector('video'); if(!v){return;} v.muted=false; v.controls=true; v.setAttribute('playsinline',''); var p=v.play(); if(p&&p.catch){p.catch(function(){ v.muted=true; v.play().catch(function(){}); });} })(); true;`;
  const play = () => webRef.current?.injectJavaScript(PLAY_JS);

  const start = async () => {
    setBusy(true);
    try {
      await ScreenRecorder.start();
      setRecording(true);
      autoStopped.current = false;
      // Try to start playback for the user (embeds usually still need a tap).
      webRef.current?.injectJavaScript(PLAY_JS);
    } catch (e) {
      Alert.alert('Recording failed', `${String(e)}\n\nTap "Discard + reset" and try again.`);
    } finally {
      setBusy(false);
    }
  };

  const stop = async (why: string) => {
    setBusy(true);
    try {
      const rec = await ScreenRecorder.stop();
      setRecording(false);
      await patchAttempt(code, { recorded: true, recordingUri: rec.uri, recordingSeconds: rec.duration, note: why });
      const crop = lastRect.current;
      router.replace({
        pathname: '/review',
        params: { uri: rec.uri, title: `${code} (${why})`, code, url: url ?? '', username: msg?.username ?? '', caption: msg?.caption ?? '', crop: crop ? JSON.stringify(crop) : '' },
      });
    } catch (e) {
      setRecording(false);
      Alert.alert('Stop failed', String(e));
    } finally {
      setBusy(false);
    }
  };

  const v = msg?.video;
  return (
    <View style={{ flex: 1 }}>
      <View ref={webWrap} style={styles.web} onLayout={measure} collapsable={false}>
        <WebViewC
          key={`${src}|${desktop ? 'd' : 'm'}`}
          userAgent={desktop ? DESKTOP_UA : undefined}
          ref={webRef}
          source={{ uri: src }}
          injectedJavaScript={EMBED_INJECTED_JS}
          onMessage={onMessage}
          onLoadEnd={() => { measure(); patchAttempt(code, { embedLoaded: !loadError }); }}
          onError={(e: { nativeEvent: { description: string } }) => setLoadError(e.nativeEvent.description)}
          onHttpError={(e: { nativeEvent: { statusCode: number } }) => setLoadError(`HTTP ${e.nativeEvent.statusCode}`)}
          // keep taps inside the embed: never hand off to the Instagram app or other schemes
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={(req: { url: string }) => /^(https?:|about:blank)/i.test(req.url)}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={false}
          javaScriptEnabled
          sharedCookiesEnabled
          style={{ flex: 1, backgroundColor: '#000' }}
        />
      </View>
      <ScrollView style={styles.panel} contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title={v ? (v.paused ? '▶ Play video' : '❚❚ playing…') : '▶ Play (no video yet)'} onPress={play} secondary disabled={!v} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={desktop ? 'Browser: desktop ✓' : 'Browser: mobile'} onPress={() => { loggedVideo.current = false; setDesktop(!desktop); }} secondary />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            {!recording ? (
              <Button title={busy ? '…' : 'Model it (record)'} onPress={start} disabled={busy} />
            ) : (
              <Button title={busy ? '…' : '■ Stop recording'} onPress={() => stop('manual stop')} disabled={busy} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Button title={mode === 'embed' ? 'Open reel page (logged-in)' : 'Back to embed'} onPress={() => { loggedVideo.current = false; setMode(mode === 'embed' ? 'page' : 'embed'); }} secondary />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title="Reload" onPress={() => webRef.current?.reload()} secondary />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Discard + reset recorder" onPress={async () => { try { await ScreenRecorder.discard(); } catch {} setRecording(false); autoStopped.current = false; }} secondary />
          </View>
        </View>
        <Text style={styles.mono}>
          {mode} · {desktop ? 'desktop UA' : 'mobile UA'}: {src}
          {'\n'}load: {loadError ?? 'ok'} · user: {msg?.username ?? '—'} · caption: {msg?.caption ? `${msg.caption.length} chars` : '—'}
          {'\n'}video: {v ? `${v.width.toFixed(0)}×${v.height.toFixed(0)} @ (${v.x.toFixed(0)},${v.y.toFixed(0)}) ${v.paused ? 'paused' : 'playing'} ${v.currentTime.toFixed(1)}/${v.duration.toFixed(1)}s ready=${v.readyState}` : 'no <video> element (yet) — tap the play button in the embed'}
          {'\n'}crop(norm): {lastRect.current ? Object.values(lastRect.current).map((n) => n.toFixed(3)).join(', ') : '—'}
          {'\n'}recording: {String(recording)}
          {'\n'}page: {msg?.bodyText ?? ''}
        </Text>
        {!!msg?.caption && <Text style={styles.small}>{msg.caption.slice(0, 300)}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  web: { height: Math.round(Dimensions.get('window').height * 0.62), backgroundColor: '#000' },
  panel: { flex: 1, backgroundColor: '#f4f4f4' },
  mono: { fontFamily: 'Menlo', fontSize: 11, color: '#333' },
  small: { fontSize: 11, color: '#666' },
});
