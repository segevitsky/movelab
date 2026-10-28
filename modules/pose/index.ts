import { requireNativeModule, type NativeModule } from 'expo-modules-core';

export type NormRect = { x: number; y: number; width: number; height: number };

export type ProcessOptions = {
  cropRect?: NormRect;
  targetFps?: number;
  maxSeconds?: number;
  delegate?: 'cpu' | 'gpu';
  modelPath?: string;
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
};

/** Same frame format as reference/sample-data/*_mp33.json. */
export type PoseFrame = {
  t: number;
  xy?: [number, number][]; // 33 × px in the (cropped) output image
  z?: number[];
  v?: number[]; // visibility 0..1 (Vision: confidence; 0 = not provided)
  w?: [number, number, number][]; // world metres (MediaPipe only)
};

export type PoseResult = {
  source: 'mediapipe' | 'vision';
  model: string;
  delegate?: string;
  fps: number;
  width: number;
  height: number;
  fullWidth: number;
  fullHeight: number;
  duration: number;
  frames: PoseFrame[];
  stats: {
    frames: number;
    detected: number;
    ms: number;
    inferMs?: number;
    initMs?: number;
    msPerFrame: number;
    cancelled: boolean;
    device: string;
  };
};

type PoseEvents = { progress: (e: { done: number; total: number; detected: number }) => void };

declare class PoseNative extends NativeModule<PoseEvents> {
  modelInfo(): { path: string | null; bytes: number; found: boolean };
  cancel(): void;
  videoInfo(fileUri: string): Promise<{ duration: number; width: number; height: number; fps: number }>;
  /** Architecture §5a: auto-crop (normalised) + floor-mat quad (source px, TL TR BR BL) + camera-static flag. */
  sceneAnalysis(fileUri: string): Promise<{ width: number; height: number; cropRect?: NormRect; matQuad?: [number, number][]; cameraStatic: boolean; samples: number; ms: number }>;
  frameImage(fileUri: string, seconds: number, options: { cropRect?: NormRect; maxSide?: number }): Promise<{ uri: string; width: number; height: number }>;
  process(fileUri: string, options: ProcessOptions): Promise<PoseResult>;
  processVision(fileUri: string, options: ProcessOptions): Promise<PoseResult>;
}

export const Pose = requireNativeModule<PoseNative>('Pose');
