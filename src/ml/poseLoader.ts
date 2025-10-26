import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as posedetection from "@tensorflow-models/pose-detection";

// BlazePose-lite + weak-frame rejection (stable on many webcams)
let detector: posedetection.PoseDetector | null = null;

export async function loadPoseDetector() {
  if (detector) return detector;
  await tf.setBackend("webgl");
  await tf.ready();

  detector = await posedetection.createDetector(
    posedetection.SupportedModels.BlazePose,
    {
      runtime: "tfjs",
      modelType: "lite",
      enableSmoothing: true,
    } as posedetection.BlazePoseTfjsModelConfig
  );
  return detector;
}

export async function estimatePoses(video: HTMLVideoElement) {
  const det = await loadPoseDetector();
  if (!video || video.readyState < 2) return null; // wait for metadata

  const poses = await det.estimatePoses(video, { flipHorizontal: false, maxPoses: 1 });
  const p = poses[0];
  // Reject weak frames (all keypoints below ~0.6)
  if (!p || (p.keypoints?.every(k => (k.score ?? 0) < 0.6))) return null;
  return p;
}
