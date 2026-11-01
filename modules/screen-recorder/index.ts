import { requireNativeModule, type NativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { unsupportedModule } from '../unsupported';

export type Recording = {
  uri: string;
  width: number;
  height: number;
  duration: number;
  wallSeconds: number;
  bytes: number;
};

declare class ScreenRecorderNative extends NativeModule {
  isAvailable(): boolean;
  isRecording(): boolean;
  start(): Promise<{ alreadyRecording: boolean; startedAt?: number }>;
  stop(): Promise<Recording>;
  discard(): Promise<void>;
  screenInfo(): { width: number; height: number; scale: number };
}

export const SCREEN_RECORDER_SUPPORTED = Platform.OS === 'ios';
export const ScreenRecorder: ScreenRecorderNative = SCREEN_RECORDER_SUPPORTED
  ? requireNativeModule<ScreenRecorderNative>('ScreenRecorder')
  : unsupportedModule<ScreenRecorderNative>('ScreenRecorder', { isAvailable: () => false, isRecording: () => false } as Partial<ScreenRecorderNative>);
