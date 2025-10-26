import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as posedetection from "@tensorflow-models/pose-detection";

let detector: posedetection.PoseDetector | null = null;

export async function getDetector() {
  if (detector) return detector;
  await tf.setBackend("webgl");
  await tf.ready();
  detector = await posedetection.createDetector(
    posedetection.SupportedModels.MoveNet,
    {
      modelType: "SinglePose.Thunder", // steadier than Lightning
      enableSmoothing: true,
    } as posedetection.MoveNetModelConfig
  );
  return detector;
}

export async function estimatePose(video: HTMLVideoElement) {
  const d = await getDetector();
  const poses = await d.estimatePoses(video, { flipHorizontal: false });
  return poses?.[0] || null;
}
