import React, { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { parseReel } from '../capture/embed';
import { POSE_SUPPORTED } from '../../modules/pose';
import { OptionRow, PromptSheet, Sheet } from './primitives';

/**
 * "Add an exercise" — every way a card can be made (owner, 2026-11-08: record yourself on the go, upload from
 * the gallery, paste a reel link, or type one in). Videos go to Review and are deleted after processing.
 */
export function AddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [link, setLink] = useState(false);
  const noPose = () => Alert.alert('Not on Android yet', 'Turning a video into a figure runs on iPhone for now. You can still receive workouts and build your own from the library.');

  const fromPhotos = async () => {
    if (!POSE_SUPPORTED) return noPose();
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    onClose();
    router.push({ pathname: '/review', params: { uri: res.assets[0].uri, title: res.assets[0].fileName ?? 'video' } });
  };
  const fromCamera = async () => {
    if (!POSE_SUPPORTED) return noPose();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera', 'Allow the camera in Settings to record an exercise.'); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 90, quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    onClose();
    router.push({ pathname: '/review', params: { uri: res.assets[0].uri, title: 'recorded' } });
  };
  const fromLink = (url: string) => {
    const r = parseReel(url.trim());
    if (!r) { Alert.alert('Not a reel link', 'Paste an Instagram reel or post link.'); return; }
    if (!POSE_SUPPORTED) return noPose();
    setLink(false); onClose();
    router.push({ pathname: '/capture', params: { code: r.code, kind: r.kind, url: url.trim() } });
  };

  return (
    <>
      <Sheet visible={visible && !link} onClose={onClose} title="Add an exercise">
        <OptionRow icon="videocam-outline" label="Record with the camera" caption="Film yourself or a friend; the video is deleted after processing" onPress={fromCamera} />
        <OptionRow icon="images-outline" label="Pick a video from Photos" caption="A reel you saved or any clip" onPress={fromPhotos} />
        <OptionRow icon="logo-instagram" label="Paste an Instagram link" caption={Platform.OS === 'ios' ? 'Or share the reel to MoveLab from Instagram' : undefined} onPress={() => setLink(true)} />
        <OptionRow icon="create-outline" label="Type it in" caption="Name and tags, no figure" onPress={() => { onClose(); router.push('/exercise/new'); }} />
      </Sheet>
      <PromptSheet visible={link} title="Instagram link" placeholder="https://www.instagram.com/reel/…" confirm="Open" onConfirm={fromLink} onClose={() => setLink(false)} />
    </>
  );
}
