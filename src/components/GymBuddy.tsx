// src/components/GymBuddy.tsx
import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";

type Keypoint = poseDetection.Keypoint;

export default function GymBuddy() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const [status, setStatus] = useState("Idle");

  // angle helper (2D)
  function angle(a: Keypoint, b: Keypoint, c: Keypoint) {
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m1 = Math.hypot(v1.x, v1.y);
    const m2 = Math.hypot(v2.x, v2.y);
    if (!m1 || !m2) return 0;
    const cos = Math.min(Math.max(dot / (m1 * m2), -1), 1);
    return (Math.acos(cos) * 180) / Math.PI;
  }

  function drawSkeleton(
    poses: poseDetection.Pose[],
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ) {
    ctx.clearRect(0, 0, w, h);
    if (!poses.length) return { body: 0, forearm: 0 };

    const kp = poses[0].keypoints;
    ctx.lineWidth = 3;
    ctx.font = "14px sans-serif";

    const by = (name: Keypoint["name"]) => kp.find((k) => k.name === name);

    const L_SH = by("left_shoulder");
    const L_HIP = by("left_hip");
    const L_ANK = by("left_ankle");
    const L_ELB = by("left_elbow");
    const L_WRI = by("left_wrist");

    const R_SH = by("right_shoulder");
    const R_HIP = by("right_hip");
    const R_ANK = by("right_ankle");
    const R_ELB = by("right_elbow");
    const R_WRI = by("right_wrist");

    function ok(p?: Keypoint) {
      return p && (p.score ?? 0) > 0.3;
    }
    function line(a?: Keypoint, b?: Keypoint) {
      if (!ok(a) || !ok(b)) return;
      ctx.beginPath();
      ctx.moveTo(a!.x, a!.y);
      ctx.lineTo(b!.x, b!.y);
      ctx.stroke();
    }

    // points
    kp.forEach((p) => {
      if (ok(p)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // skeleton
    line(L_SH, L_HIP);
    line(L_HIP, L_ANK);
    line(R_SH, R_HIP);
    line(R_HIP, R_ANK);
    line(L_SH, L_ELB);
    line(L_ELB, L_WRI);
    line(R_SH, R_ELB);
    line(R_ELB, R_WRI);

    const bodyLeft = ok(L_SH) && ok(L_HIP) && ok(L_ANK) ? angle(L_SH!, L_HIP!, L_ANK!) : 0;
    const foreLeft = ok(L_SH) && ok(L_ELB) && ok(L_WRI) ? angle(L_SH!, L_ELB!, L_WRI!) : 0;
    const bodyRight = ok(R_SH) && ok(R_HIP) && ok(R_ANK) ? angle(R_SH!, R_HIP!, R_ANK!) : 0;
    const foreRight = ok(R_SH) && ok(R_ELB) && ok(R_WRI) ? angle(R_SH!, R_ELB!, R_WRI!) : 0;

    const body = Math.max(bodyLeft, bodyRight);
    const forearm = Math.max(foreLeft, foreRight);

    const goodSpine = body > 160 && body < 185;
    const goodForearm = forearm > 80 && forearm < 115;
    const msg =
      goodSpine && goodForearm
        ? "✅ Good plank line"
        : `Body ~${body.toFixed(0)}°, Forearm ~${forearm.toFixed(0)}°`;

    ctx.fillText(msg, 12, 20);
    return { body, forearm };
  }

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function loop() {
      if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const poses = await detectorRef.current.estimatePoses(video, {
        flipHorizontal: true, // front camera mirror
      });

      drawSkeleton(poses, ctx, canvas.width, canvas.height);
      rafRef.current = requestAnimationFrame(loop);
    }

    async function init() {
      try {
        setStatus("Loading TF backend…");
        await tf.setBackend("webgl");
        await tf.ready();

        setStatus("Creating detector…");
        detectorRef.current = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          }
        );

        setStatus("Requesting camera…");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user", // change to "environment" for rear camera on phones
          },
          audio: false,
        });

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();

        setStatus("Running…");
        loop();
      } catch (e) {
        console.error(e);
        setStatus("Error: " + (e as Error).message);
      }
    }

    init();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      detectorRef.current?.dispose();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto space-y-3">
        <h1 className="text-2xl font-semibold">GymBuddy – Live Plank Coach</h1>
        <p className="text-sm text-gray-700">{status}</p>

        <div className="relative w-full max-w-3xl aspect-video bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            autoPlay
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        </div>

        <p className="text-sm text-gray-600">
          Tip: Position the camera so your body is in a clear **side view**.
        </p>
      </div>
    </div>
  );
}
