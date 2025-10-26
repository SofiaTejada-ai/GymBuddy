import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as posedetection from "@tensorflow-models/pose-detection";

let detector: posedetection.PoseDetector | null = null;

export async function getDetector() {
  if (detector) return detector;

  await tf.setBackend("webgl");
  await tf.ready();

  // Use a higher-quality model and temporal smoothing
  detector = await posedetection.createDetector(
  posedetection.SupportedModels.BlazePose,
  {
    runtime: "tfjs",
    modelType: "full",      // more stable than "lite"
    enableSmoothing: true,  // temporal smoothing
  } as posedetection.BlazePoseTfjsModelConfig
);


  // Tiny warmup to reduce first-frame flakiness
  const dummy = tf.zeros([1, 256, 256, 3]);
  await tf.nextFrame();
  dummy.dispose();

  return detector;
}

export async function estimatePose(video: HTMLVideoElement) {
  const d = await getDetector();
  const poses = await d.estimatePoses(video, { flipHorizontal: false });
  return poses?.[0] || null;
}
