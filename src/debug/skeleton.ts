/** MediaPipe Pose 33 bones for the raw debug overlay. Left = odd (grey/orange), right = even (dark/cyan). */
export const MP_BONES: [number, number][] = [
  [11, 12], [23, 24], [11, 23], [12, 24], // torso
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], // left arm + hand
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], // right arm + hand
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], // left leg + foot
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32], // right leg + foot
  [0, 2], [0, 5], [2, 7], [5, 8], [9, 10], // face
];
export const LEFT = new Set([1, 2, 3, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]);
export const FEET = new Set([29, 30, 31, 32]);
export const LM_NAMES = [
  'nose', 'eye_in_L', 'eye_L', 'eye_out_L', 'eye_in_R', 'eye_R', 'eye_out_R', 'ear_L', 'ear_R', 'mouth_L', 'mouth_R',
  'shoulder_L', 'shoulder_R', 'elbow_L', 'elbow_R', 'wrist_L', 'wrist_R', 'pinky_L', 'pinky_R', 'index_L', 'index_R',
  'thumb_L', 'thumb_R', 'hip_L', 'hip_R', 'knee_L', 'knee_R', 'ankle_L', 'ankle_R', 'heel_L', 'heel_R', 'toe_L', 'toe_R',
];
