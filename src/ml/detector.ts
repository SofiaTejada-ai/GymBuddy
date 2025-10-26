import * as posedetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

let detector: posedetection.PoseDetector | null = null;

export async function ensureTF() {
  await tf.setBackend("webgl");
  await tf.ready();
}

export async function getDetector() {
  if (detector) return detector;
  await ensureTF();
  detector = await posedetection.createDetector(
    posedetection.SupportedModels.BlazePose,
    { runtime: "tfjs", modelType: "lite" } as posedetection.BlazePoseTfjsModelConfig
  );
  return detector;
}

export async function estimatePoses(video: HTMLVideoElement) {
  const det = await getDetector();
  if (!video || video.readyState < 2) return [];
  return det.estimatePoses(video, { flipHorizontal: false });
}
