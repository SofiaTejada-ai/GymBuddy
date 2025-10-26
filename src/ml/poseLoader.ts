import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as posedetection from "@tensorflow-models/pose-detection";

let detector: posedetection.PoseDetector | null = null;

export async function loadPoseDetector() {
  if (detector) return detector;
  await tf.setBackend("webgl");
  await tf.ready();

  detector = await posedetection.createDetector(
    posedetection.SupportedModels.BlazePose,
    { runtime: "tfjs", modelType: "lite" } as posedetection.BlazePoseTfjsModelConfig
  );
  return detector;
}

export async function estimatePoses(video: HTMLVideoElement) {
  const det = await loadPoseDetector();
  if (!video || video.readyState < 2) return null; // wait until metadata is ready
  const poses = await det.estimatePoses(video, { flipHorizontal: false });
  return poses[0] || null;
}
// roll + normalization helpers used by App and tests

export type PoseMap = {
  shoulder?: KP; otherShoulder?: KP; hip?: KP; knee?: KP; ankle?: KP; wrist?: KP; ear?: KP;
  lShoulder?: KP; rShoulder?: KP; lHip?: KP; rHip?: KP;
};
export type KP = { x: number; y: number; score?: number; name?: string; part?: string };

export function normBodyLen(m: PoseMap): number {
  const S = m.shoulder, A = m.ankle;
  if (!S || !A) return 1;
  const d = Math.hypot((A.x ?? 0) - (S.x ?? 0), (A.y ?? 0) - (S.y ?? 0));
  return d || 1;
}

export function angleToVertical(p1: KP, p2: KP): number {
  const dx = (p2.x ?? 0) - (p1.x ?? 0);
  const dy = (p2.y ?? 0) - (p1.y ?? 0);
  const ang = Math.atan2(dx, dy);             // 0 when vertical
  return Math.abs((ang * 180) / Math.PI);
}

export function angleABC(a?: KP, b?: KP, c?: KP): number {
  if (!a || !b || !c) return NaN;
  const v1x = (a.x ?? 0) - (b.x ?? 0), v1y = (a.y ?? 0) - (b.y ?? 0);
  const v2x = (c.x ?? 0) - (b.x ?? 0), v2y = (c.y ?? 0) - (b.y ?? 0);
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y) || 1, m2 = Math.hypot(v2x, v2y) || 1;
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// + if right shoulder is lower than left (screen coordinates)
export function estimateRoll(m: { lShoulder?: KP; rShoulder?: KP }): number {
  const L = m.lShoulder, R = m.rShoulder;
  if (!L || !R) return 0;
  return Math.atan2((R.x - L.x), (R.y - L.y));
}

export function rotatePoint(p: KP, a: number, cx: number, cy: number): KP {
  const x = p.x - cx, y = p.y - cy;
  const ca = Math.cos(a), sa = Math.sin(a);
  return { ...p, x: cx + x * ca - y * sa, y: cy + x * sa + y * ca };
}

export function rotatePose<T extends Record<string, any>>(m: T, a: number, W: number, H: number): T {
  const cx = W / 2, cy = H / 2;
  const out: any = {};
  for (const k of Object.keys(m)) {
    const p = (m as any)[k];
    out[k] = p && Number.isFinite(p.x) && Number.isFinite(p.y) ? rotatePoint(p, a, cx, cy) : p;
  }
  return out;
}

// signed perpendicular offset of hip from shoulder→ankle line, normalized by body length
export function lineDeviation(m: PoseMap): number {
  const S = m.shoulder, A = m.ankle, H = m.hip;
  if (!S || !A || !H) return 0;
  const vx = (A.x ?? 0) - (S.x ?? 0), vy = (A.y ?? 0) - (S.y ?? 0);
  const hx = (H.x ?? 0) - (S.x ?? 0), hy = (H.y ?? 0) - (S.y ?? 0);
  const len = Math.hypot(vx, vy) || 1;
  const signed = (vx * hy - vy * hx) / len; // px
  return signed / Math.max(1, len);         // fraction
}

// true if wrists roughly stacked under shoulders (scale-invariant)
export function wristsUnderShoulders(m: PoseMap, frac = 0.08): boolean {
  if (!m.wrist || !m.shoulder) return true; // fail-open on missing KPs
  const n = normBodyLen(m);
  return Math.abs(m.wrist.x - m.shoulder.x) / n <= frac;
}
