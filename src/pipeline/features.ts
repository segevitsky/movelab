import { deg, mean, percentile } from './math';
import { normalise } from './reps';
import { LM, type ActiveJoint, type JointName, type Track } from './types';

/** Angle at b, for each frame, in degrees (analysis.py `angle`). */
export function jointAngle(xy: Track, a: number, b: number, c: number): number[] {
  return xy.map((fr) => {
    const u = [fr[a][0] - fr[b][0], fr[a][1] - fr[b][1]];
    const v = [fr[c][0] - fr[b][0], fr[c][1] - fr[b][1]];
    const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) + 1e-6);
    return deg(Math.acos(Math.min(1, Math.max(-1, cos))));
  });
}

/** name → [right triple, left triple]; angle measured at the middle index. */
export const JOINT_TRIPLES: Record<JointName, [[number, number, number], [number, number, number]]> = {
  elbow: [[LM.rightShoulder, LM.rightElbow, LM.rightWrist], [LM.leftShoulder, LM.leftElbow, LM.leftWrist]],
  shoulder: [[LM.rightHip, LM.rightShoulder, LM.rightElbow], [LM.leftHip, LM.leftShoulder, LM.leftElbow]],
  hip: [[LM.rightShoulder, LM.rightHip, LM.rightKnee], [LM.leftShoulder, LM.leftHip, LM.leftKnee]],
  knee: [[LM.rightHip, LM.rightKnee, LM.rightAnkle], [LM.leftHip, LM.leftKnee, LM.leftAnkle]],
};

/** The k most active joints by angle range (p95 − p5), one side per joint name (analysis.py `top_joints`). */
export function topJoints(xy: Track, k = 2): ActiveJoint[] {
  const rows: ActiveJoint[] = [];
  for (const name of Object.keys(JOINT_TRIPLES) as JointName[]) {
    JOINT_TRIPLES[name].forEach((tri, si) => {
      const a = jointAngle(xy, tri[0], tri[1], tri[2]);
      rows.push({ name, side: si === 0 ? 'R' : 'L', range: percentile(a, 95) - percentile(a, 5), tri });
    });
  }
  rows.sort((a, b) => b.range - a.range);
  const out: ActiveJoint[] = [];
  const used = new Set<JointName>();
  for (const r of rows) {
    if (used.has(r.name)) continue;
    out.push(r);
    used.add(r.name);
    if (out.length === k) break;
  }
  return out;
}

export type Features = {
  activeJoints: ActiveJoint[];
  /** range of motion per joint name, degrees (p95 − p5), both sides max */
  rom: Record<JointName, number>;
  /** normalised pose (COCO subset, hip-centred / torso) averaged over the first / last `edgeSeconds` */
  startPose: number[];
  endPose: number[];
  /** mean normalised speed (torso lengths per second) */
  speed: number;
};

/** Pose-derived features for tagging and flow chaining (plan Phase 1 "features"). */
export function features(xy: Track, fps: number, edgeSeconds = 0.25): Features {
  const { N } = normalise(xy);
  const n = N.length;
  const e = Math.max(1, Math.min(n, Math.round(fps * edgeSeconds)));
  const avg = (rows: number[][]) => rows[0].map((_, k) => mean(rows.map((r) => r[k])));
  const startPose = avg(N.slice(0, e));
  const endPose = avg(N.slice(n - e));
  let sp = 0;
  for (let i = 1; i < n; i++) {
    let s = 0;
    for (let k = 0; k < N[i].length; k += 2) { const dx = N[i][k] - N[i - 1][k]; const dy = N[i][k + 1] - N[i - 1][k + 1]; s += Math.sqrt(dx * dx + dy * dy); }
    sp += (s / (N[i].length / 2)) * fps;
  }
  const rom = {} as Record<JointName, number>;
  for (const name of Object.keys(JOINT_TRIPLES) as JointName[]) {
    rom[name] = Math.max(...JOINT_TRIPLES[name].map((tri) => { const a = jointAngle(xy, tri[0], tri[1], tri[2]); return percentile(a, 95) - percentile(a, 5); }));
  }
  return { activeJoints: topJoints(xy, 2), rom, startPose, endPose, speed: n > 1 ? sp / (n - 1) : 0 };
}

/** Distance between two normalised poses (for flow chaining: end pose of A vs start pose of B). */
export function poseDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let k = 0; k < a.length; k += 2) { const dx = a[k] - b[k]; const dy = a[k + 1] - b[k + 1]; s += Math.sqrt(dx * dx + dy * dy); }
  return s / (a.length / 2);
}
