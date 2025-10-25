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
