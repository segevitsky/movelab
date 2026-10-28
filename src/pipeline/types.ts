/**
 * Pure types for the pose pipeline. No React, no native imports.
 * Landmark order is MediaPipe Pose 33 everywhere (see CLAUDE.md).
 */

/** One frame as produced by modules/pose (`Pose.process`) and by reference/sample-data/*_mp33.json. */
export type RawFrame = {
  t: number;
  /** 33 × [x, y] in pixels of the processed image. Absent when no person was detected. */
  xy?: [number, number][];
  z?: number[];
  /** visibility 0..1 (MediaPipe) or confidence (Vision); absent → treated as 0 */
  v?: number[];
  /** world landmarks in metres, hip-centred (MediaPipe only) */
  w?: [number, number, number][];
};

export type RawPose = {
  fps?: number;
  width?: number;
  height?: number;
  frames: RawFrame[];
};

export type XY = [number, number];
/** [frame][joint] → [x, y]; NaN where unknown */
export type Track = XY[][];

export const N_LM = 33;

export const LM = {
  nose: 0,
  leftEye: 2, rightEye: 5, leftEar: 7, rightEar: 8, mouthLeft: 9, mouthRight: 10,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftPinky: 17, rightPinky: 18, leftIndex: 19, rightIndex: 20, leftThumb: 21, rightThumb: 22,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30,
  leftToe: 31, rightToe: 32,
} as const;

/** MediaPipe-33 indices of the COCO-17 subset, in COCO order (reference/pose-pipeline/mp2coco.py). */
export const MP2COCO = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;

export type Segment = {
  /** inclusive raw-frame index range */
  start: number;
  end: number;
  t0: number;
  t1: number;
  /** why the segment ends here */
  cutReason?: 'hip-jump' | 'pose-jump' | 'gap' | 'external' | 'end';
};

export type Limb = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export type SanityIssue = {
  frame: number; // index within the segment
  kind: 'leg-collapse' | 'arm-collapse' | 'bone-length';
  limbs: Limb[];
  detail?: string;
};

export type PeriodResult = {
  period: number; // seconds
  lag: number; // frames
  score: number; // D[lag] / median(D); lower = more periodic
  periodic: boolean;
};

export type LoopResult = { i0: number; i1: number; err: number };

export type FootTrack = {
  /** [frame] → [left, right] → [x, y] | null */
  xy: (XY | null)[][];
  /** [frame] → [left measured, right measured] */
  ok: [boolean, boolean][];
};

export type JointName = 'elbow' | 'shoulder' | 'hip' | 'knee';
export type ActiveJoint = { name: JointName; side: 'R' | 'L'; range: number; tri: [number, number, number] };
