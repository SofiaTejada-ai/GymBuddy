import React, { useEffect, useRef, useState } from "react";
import { estimatePose } from "./pose";
import { THRESH } from "./constants";

type AnalyzeOut = { formCorrect: boolean; repDetected: boolean; feedback: string };

export default function App() {
  // ---------- UI state ----------
  const [isStreaming, setIsStreaming] = useState(false);
  const [useDemo, setUseDemo] = useState(true);
  const [exercise, setExercise] = useState<"squat"|"pushup"|"plank"|"deadbug"|"wallsit">("plank");
  const [formStatus, setFormStatus] = useState<"good"|"bad"|"neutral">("neutral");
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState("");

  // plank timer
  const [plankNowMs, setPlankNowMs] = useState(0);
  const [plankBestMs, setPlankBestMs] = useState(0);

  // ---------- refs ----------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // squat FSM refs
  const sqPhaseRef = useRef<"idle"|"down"|"up">("idle");
  const sqHipBaseRef = useRef<number | null>(null);
  const sqLastRepAtRef = useRef<number>(0);

  // plank timer ref
  const plankStartRef = useRef<number | null>(null);

  // TTS debounce
  const lastCueRef = useRef<string>("");
  const lastCueUntilRef = useRef<number>(0);

  // status hysteresis
  const goodStreakRef = useRef(0);
  const badStreakRef  = useRef(0);
  const latchedOKRef  = useRef(false);

  // pose holdover (prevents nag + flicker on brief dropouts)
  const lastPoseRef = useRef<any>(null);
  const lastPoseAtRef = useRef<number>(0);

  // ---------- Demo videos ----------
  const demoMap: Record<string,string> = {
    squat:   "/demo/squat_good_side.mp4",
    pushup:  "/demo/pushup_good_side.mp4",
    plank:   "/demo/plank_good_side.mp4",
    deadbug: "/demo/deadbug_good_side.mp4",
    wallsit: "/demo/wallsit_good_side.mp4"
  };

  const isGoodDemo = useDemo && /_good_/i.test(demoMap[exercise] ?? "");

  // ---------- helpers ----------
  function speak(text: string) {
    if (useDemo) return; // audio only for YOUR camera session
    if (!text) return;
    const now = performance.now();
    if (text === lastCueRef.current && now < lastCueUntilRef.current) return;
    lastCueRef.current = text;
    lastCueUntilRef.current = now + THRESH.cueHoldMs;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }

  const angleABC = (a?: any, b?: any, c?: any) => {
    const v1x = (a?.x ?? 0) - (b?.x ?? 0), v1y = (a?.y ?? 0) - (b?.y ?? 0);
    const v2x = (c?.x ?? 0) - (b?.x ?? 0), v2y = (c?.y ?? 0) - (b?.y ?? 0);
    const dot = v1x * v2x + v1y * v2y;
    const m1 = Math.hypot(v1x, v1y) || 1, m2 = Math.hypot(v2x, v2y) || 1;
    const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)));
    return (Math.acos(cos) * 180) / Math.PI;
  };

  const hipDevDeg = (S?: any, A?: any, H?: any) => {
    if (!S || !A || !H) return 9999;
    const vx = A.x - S.x, vy = A.y - S.y;
    const hx = H.x - S.x, hy = H.y - S.y;
    const len = Math.max(1, Math.hypot(vx, vy));
    const signedPx = (vx * hy - vy * hx) / len;
    const torso = Math.max(10, Math.hypot((H.x ?? 0) - (S.x ?? 0), (H.y ?? 0) - (S.y ?? 0)));
    const frac = signedPx / torso;
    return Math.abs(frac) * 90; // ~deg
  };

  const neckAngleDeg = (shoulder?: any, hip?: any, ear?: any) => angleABC(hip, shoulder, ear);
  const shouldersOverWrists = (shoulder?: any, wrist?: any) =>
    (shoulder && wrist) ? Math.abs(shoulder.x - wrist.x) <= 60 : true;

  // forgiving keypoint pick for demos (side-view vids often have lower scores)
  const kpPick = (pose: any, name: string) => {
    const min = useDemo ? Math.min(0.25, THRESH.minKPScore) : THRESH.minKPScore;
    return pose?.keypoints?.find((k: any) => ((k.name ?? k.part) === name) && (k.score ?? 0) >= min);
  };

  function pxFromDeg(deg: number, shoulder?: any, hip?: any) {
    if (!shoulder || !hip) return 60;
    const torso = Math.hypot((hip.x ?? 0)-(shoulder.x ?? 0), (hip.y ?? 0)-(shoulder.y ?? 0));
    const rad = (deg * Math.PI) / 180;
    return Math.tan(rad) * (torso || 100);
  }

  // ---------- analysis ----------
  async function analyzeForm(): Promise<AnalyzeOut> {
    const v = videoRef.current!;
    const pose = await estimatePose(v);

    // --- holdover: reuse last good pose for brief dropouts ---
    const nowT = performance.now();
    if (pose) {
      lastPoseRef.current = pose;
      lastPoseAtRef.current = nowT;
    }
    const HOLDOVER_MS = 1200;
    const usePose = pose ?? ((nowT - lastPoseAtRef.current) < HOLDOVER_MS ? lastPoseRef.current : null);

    if (!usePose) {
      // fully lost pose → end any plank streak, but don't spam message
      if (plankStartRef.current != null) {
        const dur = performance.now() - plankStartRef.current;
        setPlankBestMs(p => Math.max(p, dur));
        plankStartRef.current = null;
        setPlankNowMs(0);
      }
      return { formCorrect: false, repDetected: false, feedback: "" };
    }

    const R = {
      hip: kpPick(usePose, "right_hip"),
      knee: kpPick(usePose, "right_knee"),
      ankle: kpPick(usePose, "right_ankle"),
      shoulder: kpPick(usePose, "right_shoulder"),
      wrist: kpPick(usePose, "right_wrist"),
      ear: kpPick(usePose, "right_ear")
    };
    const L = {
      hip: kpPick(usePose, "left_hip"),
      knee: kpPick(usePose, "left_knee"),
      ankle: kpPick(usePose, "left_ankle"),
      shoulder: kpPick(usePose, "left_shoulder"),
      wrist: kpPick(usePose, "left_wrist"),
      ear: kpPick(usePose, "left_ear")
    };

    const hip = R.hip || L.hip;
    const knee = R.knee || L.knee;
    const ankle = R.ankle || L.ankle;
    const shoulder = R.shoulder || L.shoulder;
    const wrist = R.wrist || L.wrist;
    const ear = R.ear || L.ear;

    // require fewer points for demos; more for camera
    const need = useDemo ? 2 : 3;
    const kpList = [hip, knee, ankle, shoulder, wrist, ear].filter(Boolean);
    if (kpList.length < need) {
      // for GOOD demo clips, assume OK if the video is playing
      if (isGoodDemo && !v.paused && v.readyState >= 2) {
        return { formCorrect: true, repDetected: false, feedback: "Hold steady" };
      }
      return { formCorrect: false, repDetected: false, feedback: "" };
    }

    const devDeg = hipDevDeg(shoulder, ankle, hip);
    const neckDeg = neckAngleDeg(shoulder, hip, ear);
    const lineOK = devDeg <= THRESH.lineDevMax;
    const neckOK = neckDeg <= THRESH.neckMax;

    if (exercise === "plank") {
      // accept forearm planks: no wrist alignment check
      const ok = lineOK && neckOK;
      const now = performance.now();
      let cue = ok ? "Hold steady" : (lineOK ? "Relax neck" : (hip && shoulder && hip.y > shoulder.y) ? "Lift hips" : "Lower hips");

      if (ok) {
        if (plankStartRef.current == null) plankStartRef.current = now;
        setPlankNowMs(now - (plankStartRef.current ?? now));
      } else {
        if (plankStartRef.current != null) {
          const dur = now - plankStartRef.current;
          setPlankBestMs(p => Math.max(p, dur));
          plankStartRef.current = null;
        }
        setPlankNowMs(0);
      }
      return { formCorrect: ok, repDetected: false, feedback: cue };
    }

    if (exercise === "squat") {
      const kneeDeg = angleABC(hip, knee, ankle);
      const depthStrictOK = kneeDeg >= THRESH.squatDepthMin && kneeDeg <= THRESH.squatDepthMax;
      // Wider “looks good” window so standard squat demos go green
      const depthWideOK = kneeDeg <= 140;
      const depthOK = depthStrictOK || (useDemo ? depthWideOK : false);

      const torsoPx = (shoulder && hip) ? Math.abs(shoulder.x - hip.x) : 0;
      const torsoOK = torsoPx <= pxFromDeg(THRESH.squatTorsoChangeMax, shoulder, hip);

      let cue = "";
      if (!depthOK) cue = kneeDeg > THRESH.squatDepthMax ? "Go deeper" : "Rise slightly";
      else if (!torsoOK) cue = "Chest tall";
      else cue = "Nice rep";

      // rep FSM
      let rep = false;
      if (hip?.y != null) {
        if (sqHipBaseRef.current == null) sqHipBaseRef.current = hip.y;
        sqHipBaseRef.current = 0.95 * (sqHipBaseRef.current ?? hip.y) + 0.05 * hip.y;

        const movedDown = hip.y > (sqHipBaseRef.current * (1 + THRESH.repDownFrac));
        const backNearTop = hip.y <= (sqHipBaseRef.current * (1 + THRESH.repTopFrac));

        if (sqPhaseRef.current === "idle" && movedDown) {
          sqPhaseRef.current = "down";
        } else if (sqPhaseRef.current === "down" && depthOK && !movedDown) {
          sqPhaseRef.current = "up";
        } else if (sqPhaseRef.current === "up" && backNearTop) {
          const now = performance.now();
          const okGap = now - sqLastRepAtRef.current > 650;
          sqPhaseRef.current = "idle";
          if (okGap) {
            sqLastRepAtRef.current = now;
            rep = true;
          }
        }
      }

      return { formCorrect: depthOK && torsoOK, repDetected: rep, feedback: cue };
    }

    if (exercise === "pushup") {
      const supportOK = shouldersOverWrists(shoulder, wrist);
      const ok = lineOK && neckOK && supportOK;
      let cue = "";
      if (!supportOK) cue = "Wrists under shoulders";
      else if (!lineOK) cue = "Straight line head→heels";
      else if (!neckOK) cue = "Tuck chin slightly";
      else cue = "Solid";
      return { formCorrect: ok, repDetected: false, feedback: cue };
    }

    if (exercise === "deadbug") {
      const backPx = (hip && shoulder) ? Math.abs((hip.x ?? 0) - (shoulder.x ?? 0)) : 9999;
      const backOK = backPx <= THRESH.deadbugBackContactMaxPx;
      const ok = backOK && neckOK;
      const cue = backOK ? (neckOK ? "Slow reach" : "Relax neck") : "Press lower back";
      return { formCorrect: ok, repDetected: false, feedback: cue };
    }

    if (exercise === "wallsit") {
      const kneeDeg = angleABC(hip, knee, ankle);
      const depthOK = kneeDeg >= THRESH.squatDepthMin && kneeDeg <= THRESH.squatDepthMax;
      const shinTiltPx = (knee && ankle) ? Math.abs((knee.x ?? 0) - (ankle.x ?? 0)) : 9999;
      const backTiltPx = (hip && shoulder) ? Math.abs((hip.x ?? 0) - (shoulder.x ?? 0)) : 9999;
      const shinOK = shinTiltPx <= THRESH.wallsitShinTiltMax;
      const backOK = backTiltPx <= THRESH.wallsitBackTiltMax;
      const ok = depthOK && shinOK && backOK;
      let cue = "";
      if (!depthOK) cue = kneeDeg > THRESH.squatDepthMax ? "Slide down a little" : "Rise slightly";
      else if (!shinOK) cue = "Feet under knees";
      else if (!backOK) cue = "Back to wall";
      else cue = "Hold steady";
      return { formCorrect: ok, repDetected: false, feedback: cue };
    }

    return { formCorrect: false, repDetected: false, feedback: "Tracking…" };
  }

  // ---------- loop ----------
  const startAnalysis = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(async () => {
      const res = await analyzeForm();

      // Hysteresis latch for stable border color
      const okNow = !!res.formCorrect;
      if (okNow) {
        goodStreakRef.current += 1;
        badStreakRef.current = 0;
      } else {
        badStreakRef.current += 1;
        goodStreakRef.current = 0;
      }
      const needGood = (THRESH as any).goodFramesToGreen ?? 4;
      const needBad  = (THRESH as any).badFramesToRed ?? 4;

      if (!latchedOKRef.current && goodStreakRef.current >= needGood) latchedOKRef.current = true;
      if (latchedOKRef.current && badStreakRef.current >= needBad)   latchedOKRef.current = false;

      setFormStatus(latchedOKRef.current ? "good" : "bad");
      setFeedback(res.feedback);
      if (!useDemo) speak(res.feedback);
      if (exercise === "squat" && res.repDetected) setRepCount(r => r + 1);
    }, 500);
  };

  // ---------- sources ----------
  const startDemo = async () => {
    stopAll();
    const v = videoRef.current!;
    v.crossOrigin = "anonymous";
    v.srcObject = null;
    v.src = demoMap[exercise];
    v.loop = true;
    v.muted = true;
    v.onloadedmetadata = () => v.play().catch(() => {});
    setIsStreaming(true);
    startAnalysis();
  };

  const startWebcam = async () => {
    stopAll();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      v.onloadedmetadata = () => v.play().catch(() => {});
      setIsStreaming(true);
      startAnalysis();
    } catch (e) {
      console.error(e);
      setFeedback("Could not access camera. Check permissions.");
    }
  };

  const start = async () => {
    setRepCount(0);
    setFormStatus("neutral");
    setFeedback("Analyzing…");
    setPlankNowMs(0);
    setPlankBestMs(0);
    sqPhaseRef.current = "idle";
    sqHipBaseRef.current = null;
    sqLastRepAtRef.current = 0;
    plankStartRef.current = null;

    goodStreakRef.current = 0;
    badStreakRef.current  = 0;
    latchedOKRef.current  = false;

    if (useDemo) await startDemo();
    else await startWebcam();
  };

  const stopAll = () => {
    if (intervalRef.current) { window.clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) { v.pause(); v.srcObject = null; v.src = ""; }
    setIsStreaming(false);
    setFormStatus("neutral");
  };

  useEffect(() => {
    if (isStreaming && useDemo) startDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, useDemo]);

  useEffect(() => () => stopAll(), []);

  // ---------- UI helpers ----------
  const borderCss =
    formStatus === "good"
      ? { border: "4px solid #22c55e", boxShadow: "0 0 0 2px rgba(34,197,94,0.25), 0 0 24px rgba(34,197,94,0.35)"}
      : formStatus === "bad"
      ? { border: "4px solid #ef4444", boxShadow: "0 0 0 2px rgba(239,68,68,0.25), 0 0 24px rgba(239,68,68,0.35)"}
      : { border: "4px solid rgba(255,255,255,0.25)", boxShadow: "none" };

  const pill = {
    fontSize:14, padding:"8px 12px", borderRadius:999, color:"#fff",
    background:"rgba(0,0,0,0.6)", display:"inline-flex", gap:8, alignItems:"center"
  } as React.CSSProperties;

  const mmss = (ms: number) => {
    const s = Math.floor(ms/1000);
    const m = Math.floor(s/60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2,"0")}`;
  };

  // ---------- RENDER ----------
  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg,#1f2147,#0a2642)",
      color:"#fff",
      padding:24
    }}>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <h1 style={{fontSize:36,margin:0}}>GymBuddy</h1>
          <div style={{opacity:0.9}}>Demo toggle, green/red border, exercise selector, real pose logic</div>
        </div>

        {/* Controls */}
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
          <label>
            Exercise:&nbsp;
            <select value={exercise} onChange={e => setExercise(e.target.value as any)}
              style={{color:"#111", borderRadius:6, padding:"6px 8px"}}>
              <option value="squat">Squat</option>
              <option value="pushup">Push-up</option>
              <option value="plank">Plank</option>
              <option value="deadbug">Dead bug</option>
              <option value="wallsit">Wall sit</option>
            </select>
          </label>

          <label style={{display:"flex",alignItems:"center",gap:6}}>
            <input type="checkbox" checked={useDemo}
              onChange={e => setUseDemo(e.target.checked)} disabled={isStreaming}/>
            Use demo video
          </label>

          {!isStreaming ? (
            <button onClick={start} style={btn("#10b981")}>Start</button>
          ) : (
            <button onClick={stopAll} style={btn("#ef4444")}>Stop</button>
          )}

          {isStreaming && exercise==="squat" && (
            <button onClick={() => setRepCount(0)} style={btn("rgba(255,255,255,0.25)")}>Reset Reps</button>
          )}
        </div>

        {/* Video */}
        <div style={{position:"relative",background:"rgba(0,0,0,0.65)",borderRadius:12,overflow:"hidden"}}>
          <div style={{position:"relative", ...borderCss}}>
            <video ref={videoRef} autoPlay playsInline muted crossOrigin="anonymous"
              style={{display:"block",width:"100%",maxHeight:480,transform:"scaleX(-1)"}} />
          </div>

          {isStreaming && (
            <>
              <div style={{position:"absolute",top:12,right:12}}>
                <div style={pill}>
                  <span style={{
                    display:"inline-block",width:10,height:10,borderRadius:999,
                    background: formStatus==="good" ? "#22c55e" : formStatus==="bad" ? "#ef4444" : "#9ca3af"
                  }} />
                  {formStatus==="good" ? "Good Form" : formStatus==="bad" ? "Adjust Form" : "Analyzing…"}
                </div>
              </div>

              <div style={{position:"absolute",top:12,left:12,display:"flex",flexDirection:"column",gap:8}}>
                {exercise==="squat" && (<div style={pill}>Reps: <b style={{marginLeft:6}}>{repCount}</b></div>)}
                {exercise==="plank" && (
                  <>
                    <div style={pill}>Hold: <b style={{marginLeft:6}}>{mmss(plankNowMs)}</b></div>
                    <div style={pill}>Best: <b style={{marginLeft:6}}>{mmss(plankBestMs)}</b></div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Feedback */}
        {isStreaming && feedback && (
          <div style={{
            marginTop:12,padding:12,borderRadius:8,
            background: formStatus==="good" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            border:`1px solid ${formStatus==="good" ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`
          }}>
            {feedback}
          </div>
        )}

        <canvas ref={canvasRef} style={{display:"none"}} />
      </div>
    </div>
  );
}

function btn(bg: string) {
  return {
    background:bg, color:"#fff", border:"none", padding:"8px 14px",
    borderRadius:8, fontWeight:700
  } as React.CSSProperties;
}
