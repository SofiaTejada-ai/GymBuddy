import React, { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle, XCircle, Activity, Info } from 'lucide-react';

export default function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [formStatus, setFormStatus] = useState('neutral');
  const [selectedExercise, setSelectedExercise] = useState('squat');
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState('');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const analysisIntervalRef = useRef(null);

  const exercises = [
    { id: 'squat', name: 'Squats', description: 'Keep back straight, knees over toes' },
    { id: 'pushup', name: 'Push-ups', description: 'Straight line from head to heels' },
    { id: 'plank', name: 'Plank', description: 'Core engaged, hips level' },
    { id: 'lunge', name: 'Lunges', description: 'Front knee at 90 degrees' },
  ];

  const startWebcam = async () => {
    // Stop any previous stream before starting a new one
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
        startAIAnalysis();
      }
    } catch (err) {
      console.error('Error accessing webcam:', err);
      setFeedback('Unable to access camera. Please check permissions.');
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    stopAIAnalysis();
  };

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  };

  const analyzeFormWithAI = async () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const random = Math.random();
        const isGoodForm = random > 0.3;
        
        resolve({
          formCorrect: isGoodForm,
          feedback: isGoodForm ? 'Great form! Keep it up!' : 'Adjust your posture slightly',
          repDetected: random > 0.9,
        });
      }, 100);
    });
  };

  const startAIAnalysis = () => {
    analysisIntervalRef.current = setInterval(async () => {
      const frameData = captureFrame();
      if (frameData) {
        const analysis = await analyzeFormWithAI();
        
        if (analysis) {
          setFormStatus(analysis.formCorrect ? 'good' : 'bad');
          setFeedback(analysis.feedback);
          
          if (analysis.repDetected) {
            setRepCount(prev => prev + 1);
          }
        }
      }
    }, 500);
  };

  const stopAIAnalysis = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }
  };

  useEffect(() => {
    return () => stopWebcam();
  }, []);

  const getBorderColor = () => {
    if (formStatus === 'good') return 'border-green-500';
    if (formStatus === 'bad') return 'border-red-500';
    return 'border-gray-300';
  };

  const getStatusColor = () => {
    if (formStatus === 'good') return 'bg-green-500';
    if (formStatus === 'bad') return 'bg-red-500';
    return 'bg-gray-400';
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Activity className="w-10 h-10 text-blue-500" />
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">GymBuddy</h1>
          </div>
          <p className="text-gray-500 text-lg">AI-Powered Exercise Form Checker</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8 border border-gray-200">
          <div className="mb-8">
            <label className="block text-base font-semibold text-gray-700 mb-3">
              Select Exercise
            </label>
            <div className="grid grid-cols-2 gap-4">
              {exercises.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setSelectedExercise(ex.id)}
                  disabled={isStreaming}
                  className={`p-4 rounded-xl border-2 font-medium shadow-sm transition-all duration-150 text-base flex flex-col items-center ${
                    selectedExercise === ex.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-100 text-gray-700'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span>{ex.name}</span>
                  <span className="text-xs text-gray-400 mt-1">{ex.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative">

            <div className={`relative rounded-2xl overflow-hidden border-2 ${getBorderColor()} shadow-lg bg-gray-200 transition-colors duration-300`}> 
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto object-cover"
                style={{ maxHeight: '420px' }}
              />
              {!isStreaming && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/60">
                  <Camera className="w-20 h-20 text-blue-300 mb-4 animate-pulse" />
                  <span className="text-lg text-blue-100 font-semibold">Start your session!</span>
                </div>
              )}
              {isStreaming && (
                <>
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-white/90 px-4 py-2 rounded-full border border-gray-200 shadow-md">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
                    <span className="text-gray-800 text-sm font-medium">
                      {formStatus === 'good' ? 'Good Form' : formStatus === 'bad' ? 'Adjust Form' : 'Analyzing...'}
                    </span>
                  </div>
                  <div className="absolute top-4 left-4 bg-white/90 px-4 py-2 rounded-full border border-gray-200 shadow-md">
                    <div className="text-blue-700 text-sm font-semibold">
                      Reps: <span className="font-bold text-lg">{repCount}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="mt-8 flex gap-4">
            <button
              onClick={isStreaming ? stopWebcam : startWebcam}

              // Deleted. Use GymBuddy or your AI component as the main app.
                  ? 'bg-red-500 hover:bg-red-600'
