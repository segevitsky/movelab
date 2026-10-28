import { requireNativeModule, type NativeModule } from 'expo-modules-core';

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

export const ScreenRecorder = requireNativeModule<ScreenRecorderNative>('ScreenRecorder');
