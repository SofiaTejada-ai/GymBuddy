// src/App.js  — minimal, no Tailwind, no icon libs
import React, { useEffect, useRef, useState } from "react";

export default function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [useDemo, setUseDemo] = useState(true);
  const [exercise, setExercise] = useState("squat");
  const [formStatus, setFormStatus] = useState("neutral"); // 'good' | 'bad' | 'neutral'
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  const demoMap = {
    squat:   "/demo/squat_good_side.mp4",
    pushup:  "/demo/pushup_good_side.mp4",
    plank:   "/demo/plank_good_side.mp4",
    deadbug: "/demo/deadbug_good_side.mp4",
    wallsit: "/demo/wallsit_good_side.mp4",
  };

  // --- helpers ---
  const startDemo = async () => {
    stopAll();
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = null;
    v.src = demoMap[exercise];
    v.loop = true;
    v.muted = true;
    v.onloadedmetadata = () => {
      v.play().catch(() => {});
    };
    setIsStreaming(true);
    startAnalysis();
  };

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      v.onloadedmetadata = () => v.play().catch(() => {});
      setIsStreaming(true);
      startAnalysis();
    } catch (e) {
      console.error(e);
      setFeedback("Could not access camera. Check permissions.");
    }
  };

  const stopAll = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
      v.src = "";
    }
    setIsStreaming(false);
    setFormStatus("neutral");
  };

  const start = async () => {
    setRepCount(0);
    setFormStatus("neutral");
    setFeedback("Analyzing…");
    if (useDemo) await startDemo();
    else await startWebcam();
  };

  // Capture a frame as base64 (for plugging in your model later)
  const captureFrame = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth || !v.videoHeight) return null;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0);
    return c.toDataURL("image/jpeg", 0.85);
  };

  // Fake “AI” to show the UI behavior; replace with your model call
  const analyzeForm = async (imageBase64) => {
    // simulate a quick result
    const r = Math.random();
    const good = r > 0.35; // ~65% good
    return {
      formCorrect: good,
      repDetected: r > 0.9,
      feedback: good ? "Great form — keep it up!" : defaultTip(exercise),
    };
  };

  const defaultTip = (ex) => {
    switch (ex) {
      case "squat": return "Push knees out; chest tall.";
      case "pushup": return "Straight line head→heels.";
      case "plank": return "Shoulders over wrists; hips level.";
      case "deadbug": return "Press lower back into floor.";
      case "wallsit": return "Slide down; knees near 90°.";
      default: return "Adjust posture slightly.";
    }
  };

  const startAnalysis = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const frame = captureFrame();
      if (!frame) return;
      const res = await analyzeForm(frame);
      setFormStatus(res.formCorrect ? "good" : "bad");
      setFeedback(res.feedback || "");
      if (res.repDetected) setRepCount(prev => prev + 1);
    }, 500);
  };

  // restart demo autoplay when exercise changes while streaming in demo mode
  useEffect(() => {
    if (isStreaming && useDemo) startDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, useDemo]);

  useEffect(() => () => stopAll(), []);

  const borderColor =
    formStatus === "good" ? "4px solid #10b981" :
    formStatus === "bad"  ? "4px solid #ef4444" :
                            "4px solid #d1d5db";

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#eff6ff,#eef2ff)",padding:24,fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif"}}>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <h1 style={{fontSize:36,margin:0,color:"#1f2937"}}>GymBuddy</h1>
          <div style={{color:"#4b5563"}}>Demo video toggle + green/red border + exercise selector</div>
        </div>

        {/* Controls */}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
          <label>
            Exercise:&nbsp;
            <select value={exercise} onChange={e => setExercise(e.target.value)}>
              <option value="squat">Squat</option>
              <option value="pushup">Push-up</option>
              <option value="plank">Plank</option>
              <option value="deadbug">Dead bug</option>
              <option value="wallsit">Wall sit</option>
            </select>
          </label>

          <label style={{display:"flex",alignItems:"center",gap:6}}>
            <input
              type="checkbox"
              checked={useDemo}
              onChange={e => setUseDemo(e.target.checked)}
              disabled={isStreaming}
            />
            Use demo video
          </label>

          {!isStreaming ? (
            <button onClick={start} style={btn("#4f46e5")}>Start</button>
          ) : (
            <button onClick={stopAll} style={btn("#ef4444")}>Stop</button>
          )}

          {isStreaming && (
            <button onClick={() => setRepCount(0)} style={btn("#6b7280")}>Reset Reps</button>
          )}
        </div>

        {/* Video box */}
        <div style={{position:"relative",background:"#111827",borderRadius:12,overflow:"hidden"}}>
          <div style={{position:"relative",border:borderColor}}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{display:"block",width:"100%",maxHeight:480,transform:"scaleX(-1)"}}
            />
          </div>

          {/* Status Badges */}
          {isStreaming && (
            <>
              <div style={{
                position:"absolute",top:12,right:12,background:"rgba(0,0,0,0.6)",
                color:"#fff",padding:"8px 12px",borderRadius:999,display:"flex",
                alignItems:"center",gap:8,fontSize:14
              }}>
                <span style={{
                  display:"inline-block",width:10,height:10,borderRadius:999,
                  background: formStatus==="good" ? "#10b981" : formStatus==="bad" ? "#ef4444" : "#9ca3af"
                }} />
                {formStatus==="good" ? "Good Form" : formStatus==="bad" ? "Adjust Form" : "Analyzing…"}
              </div>

              <div style={{
                position:"absolute",top:12,left:12,background:"rgba(0,0,0,0.6)",
                color:"#fff",padding:"8px 12px",borderRadius:999,fontSize:14
              }}>
                Reps: <b style={{fontSize:16}}>{repCount}</b>
              </div>
            </>
          )}
        </div>

        {/* Feedback */}
        {isStreaming && feedback && (
          <div style={{
            marginTop:12,padding:12,borderRadius:8,
            background: formStatus==="good" ? "#ecfdf5" : "#fef2f2",
            color: formStatus==="good" ? "#065f46" : "#991b1b",
            border: `1px solid ${formStatus==="good" ? "#a7f3d0" : "#fecaca"}`
          }}>
            {feedback}
          </div>
        )}

        <canvas ref={canvasRef} style={{display:"none"}} />
      </div>
    </div>
  );
}

function btn(bg) {
  return {
    background:bg,color:"#fff",border:"none",padding:"8px 14px",
    borderRadius:8,fontWeight:600,cursor:"pointer"
  };
}
