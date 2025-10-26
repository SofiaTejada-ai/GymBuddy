import React, { useState, useRef, useEffect } from 'react';
import { Camera, CheckCircle, XCircle, Activity, Info } from 'lucide-react';

export default function GymBuddy() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [formStatus, setFormStatus] = useState('neutral'); // 'good', 'bad', 'neutral'
  const [selectedExercise, setSelectedExercise] = useState('squat');
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
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
      
      // Convert to base64 for AI API
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  };

  const analyzeFormWithAI = async (imageData) => {
    // ==================================================================
    // AI API INTEGRATION POINT
    // ==================================================================
    // Replace this function with your actual AI API call
    // 
    // Example structure for pose detection API:
    /*
    try {
      const response = await fetch('YOUR_AI_API_ENDPOINT', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer YOUR_API_KEY'
        },
        body: JSON.stringify({
          image: imageData,
          exercise_type: selectedExercise,
          // Add other parameters your AI model needs
        })
      });
      
      const result = await response.json();
      
      // Process AI response
      return {
        formCorrect: result.form_score > 0.8,
        confidence: result.confidence,
        feedback: result.feedback_message,
        repDetected: result.rep_completed,
        keypoints: result.pose_keypoints // For visualization
      };
    } catch (error) {
      console.error('AI API Error:', error);
      return null;
    }
    */
    
    // DEMO MODE: Simulated AI response
    // Remove this when integrating real AI
    return new Promise((resolve) => {
      setTimeout(() => {
        const random = Math.random();
        const isGoodForm = random > 0.3;
        
        resolve({
          formCorrect: isGoodForm,
          confidence: 0.85 + Math.random() * 0.15,
          feedback: isGoodForm 
            ? 'Great form! Keep it up!' 
            : 'Adjust your posture slightly',
          repDetected: random > 0.9,
        });
      }, 100);
    });
  };

  const startAIAnalysis = () => {
    setIsAnalyzing(true);
    
    // Analyze frames every 500ms
    analysisIntervalRef.current = setInterval(async () => {
      const frameData = captureFrame();
      if (frameData) {
        const analysis = await analyzeFormWithAI(frameData);
        
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
    setIsAnalyzing(false);
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  const getBorderColor = () => {
    switch (formStatus) {
      case 'good': return 'border-green-500';
      case 'bad': return 'border-red-500';
      default: return 'border-gray-300';
    }
  };

  const getStatusColor = () => {
    switch (formStatus) {
      case 'good': return 'bg-green-500';
      case 'bad': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Activity className="w-10 h-10 text-indigo-600" />
            <h1 className="text-4xl font-bold text-gray-800">GymBuddy</h1>
          </div>
          <p className="text-gray-600">AI-Powered Exercise Form Checker</p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          {/* Exercise Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Exercise
            </label>
            <div className="grid grid-cols-2 gap-3">
              {exercises.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setSelectedExercise(ex.id)}
                  disabled={isStreaming}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedExercise === ex.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="font-semibold text-gray-800">{ex.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{ex.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Video Feed */}
          <div className="relative">
            <div className={`relative rounded-xl overflow-hidden border-4 ${getBorderColor()} transition-colors duration-300 bg-gray-900`}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto"
                style={{ maxHeight: '480px', transform: 'scaleX(-1)' }}
              />
              
              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <Camera className="w-24 h-24 text-gray-600" />
                </div>
              )}

              {/* Status Indicator */}
              {isStreaming && (
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-black bg-opacity-60 px-4 py-2 rounded-full">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
                  <span className="text-white text-sm font-medium">
                    {formStatus === 'good' ? 'Good Form' : formStatus === 'bad' ? 'Adjust Form' : 'Analyzing...'}
                  </span>
                </div>
              )}

              {/* Rep Counter */}
              {isStreaming && (
                <div className="absolute top-4 left-4 bg-black bg-opacity-60 px-4 py-2 rounded-full">
                  <div className="text-white text-sm">
                    Reps: <span className="font-bold text-lg">{repCount}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Controls */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={isStreaming ? stopWebcam : startWebcam}
              className={`flex-1 py-3 px-6 rounded-lg font-semibold text-white transition-all ${
                isStreaming
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isStreaming ? 'Stop Session' : 'Start Session'}
            </button>
            
            {isStreaming && (
              <button
                onClick={() => setRepCount(0)}
                className="px-6 py-3 rounded-lg font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 transition-all"
              >
                Reset Reps
              </button>
            )}
          </div>

          {/* Feedback */}
          {feedback && isStreaming && (
            <div className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${
              formStatus === 'good' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              {formStatus === 'good' ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p className={`${formStatus === 'good' ? 'text-green-800' : 'text-red-800'}`}>
                {feedback}
              </p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">AI Integration Ready</p>
              <p>Check the <code className="bg-blue-100 px-1 rounded">analyzeFormWithAI</code> function in the code to connect your pose detection AI API. The app captures frames and sends them for analysis every 500ms.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}