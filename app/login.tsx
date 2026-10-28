import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { DESKTOP_UA } from '../src/capture/embed';
import { Button } from './index';

const WebViewC = WebView as unknown as React.ComponentType<WebViewProps>;

/**
 * Phase 0 task 6: the user logs in to instagram.com themselves, inside the app's WebView.
 * We inject nothing, read nothing, store nothing — the session cookie stays in WKWebView's
 * default data store, which the Capture screen's WebView shares.
 */
export default function Login() {
  const router = useRouter();
  const [url, setUrl] = useState('https://www.instagram.com/accounts/login/');
  const loggedIn = /instagram\.com\/?(\?|$)|\/reels?\/|\/explore/.test(url) && !/accounts\/login|challenge/.test(url);
  return (
    <View style={{ flex: 1 }}>
      <WebViewC
        source={{ uri: 'https://www.instagram.com/accounts/login/' }}
        userAgent={DESKTOP_UA}
        onNavigationStateChange={(e: { url: string }) => setUrl(e.url)}
        sharedCookiesEnabled
        allowsInlineMediaPlayback
        style={{ flex: 1 }}
      />
      <View style={styles.bar}>
        <Text style={styles.mono} numberOfLines={1}>
          {loggedIn ? 'logged in ✓ · ' : ''}{url}
        </Text>
        <Button title={loggedIn ? 'Done' : 'Done (not logged in yet)'} onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { padding: 10, gap: 6, backgroundColor: '#f4f4f4' },
  mono: { fontFamily: 'Menlo', fontSize: 10, color: '#555' },
});
