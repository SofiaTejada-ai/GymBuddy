import React, { useRef, useState, useEffect } from "react"
import { Camera, StopCircle } from "lucide-react"
import * as tf from "@tensorflow/tfjs"
import * as poseDetection from "@tensorflow-models/pose-detection"
import "@tensorflow/tfjs-backend-webgl"

export default function GymBuddy() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>(null)
  const [running, setRunning] = useState(false)
  const [feedback, setFeedback] = useState("Ready to start!")
  const [formCorrect, setFormCorrect] = useState(true)
  const [repCount, setRepCount] = useState(0)

  useEffect(() => {
    const loadDetector = async () => {
      await tf.ready()
      const det = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet
      )
      setDetector(det)
    }
    loadDetector()
  }, [])

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play()
    }
    setRunning(true)
    loop()
  }

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream
    stream?.getTracks().forEach(track => track.stop())
    setRunning(false)
  }

  const loop = async () => {
    if (!detector || !running || !videoRef.current) return
    const poses = await detector.estimatePoses(videoRef.current)
    if (poses.length > 0) {
      setFormCorrect(true)
      setFeedback("Nice form! Keep going")
    } else {
      setFormCorrect(false)
      setFeedback("Move into frame so I can detect your pose")
    }
    requestAnimationFrame(loop)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-6">GymBuddy</h1>

      <video
        ref={videoRef}
        className="w-80 h-60 bg-black rounded-lg mb-4"
        style={{ transform: "scaleX(-1)" }}
      />

      <div className="flex gap-4">
        {!running ? (
          <button
            onClick={startCamera}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
          >
            <Camera /> Start
          </button>
        ) : (
          <button
            onClick={stopCamera}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
          >
            <StopCircle /> Stop
          </button>
        )}
      </div>

      <div
        className={`mt-6 p-4 rounded-lg ${
          formCorrect ? "bg-green-700" : "bg-red-700"
        }`}
      >
        {feedback}
      </div>

      <div className="mt-2 text-lg">Reps: {repCount}</div>
    </div>
  )
}

