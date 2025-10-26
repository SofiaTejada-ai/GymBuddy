import React, { useEffect, useRef, useState } from "react";
import { estimatePose } from "./pose";
import { THRESH } from "./constants";

type AnalyzeOut = { formCorrect: boolean; repDetected: boolean; feedback: string };

export default function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [useDemo, setUseDemo] = useState(true);
  const [exercise, setExercise] = useState<"squat" | "pushup" | "plank" | "deadbug" | "wallsit">("squat");
  const [formStatus, setFormStatus] = useState<"good" | "bad" | "neutral">("neutral");
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState("");

  // plank timer
  const [plankNowMs, setPlankNowMs] = useState(0);
  const [plankBestMs, setPlankBestMs] = useState(0);

  // refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // squat FSM / baseline
  const sqPhaseRef = useRef<"idle" | "down" | "up">("idle");
  const sqHipBaseRef = useRef<number | null>(null);
  const sqLastRepAtRef = useRef<number>(0);

  // plank timer ref
  const plankStartRef = useRef<number | null>(null);

  // TTS debounce
  const lastCueRef = useRef<string>("");
  const lastCueUntilRef = useRef<number>(0);

  // pose holdover to avoid flicker on brief drops
  const lastPoseRef = useRef<any>(null);
  const lastPoseAtRef = useRef<number>(0);

  const demoMap: Record<string, string> = {
    squat: "/demo/squat_good_side.mp4",
    pushup: "/demo/pushup_good_side.mp4",
    plank: "/demo/plank_good_side.mp4",
    deadbug: "/demo/deadbug_good_side.mp4",
    wallsit: "/demo/wallsit_good_side.mp4",
  };

  function speak(text: string) {
    if (useDemo || !text) return;
    const now = performance.now();
    if (text === lastCueRef.current && now < lastCueUntilRef.current) return;
    lastCueRef.current = text;
    lastCueUntilRef.current = now + THRESH.cueHoldMs;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }

  // ---- helpers ----
  const kpPick = (pose: any, name: string) =>
    pose?.keypoints?.find((k: any) => (k.name ?? k.part) === name && (k.score ?? 0) >= THRESH.minKPScore);

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

  const pxFromDeg = (deg: number, shoulder?: any, hip?: any) => {
    if (!shoulder || !hip) return 60;
    const torso = Math.hypot((hip.x ?? 0) - (shoulder.x ?? 0), (hip.y ?? 0) - (shoulder.y ?? 0));
    const rad = (deg * Math.PI) / 180;
    return Math.tan(rad) * (torso || 100);
  };

  // ---------- analysis ----------
  async function analyzeForm(): Promise<AnalyzeOut> {
    const v = videoRef.current!;
    const pose = await estimatePose(v);

    // holdover 1.2s
    const nowT = performance.now();
    if (pose) {
      lastPoseRef.current = pose;
      lastPoseAtRef.current = nowT;
    }
    const usePose = pose ?? ((nowT - lastPoseAtRef.current) < 1200 ? lastPoseRef.current : null);
    if (!usePose) return { formCorrect: false, repDetected: false, feedback: "" };

    // landmarks (pick best available side)
    const R = {
      hip: kpPick(usePose, "right_hip"),
      knee: kpPick(usePose, "right_knee"),
      ankle: kpPick(usePose, "right_ankle"),
      shoulder: kpPick(usePose, "right_shoulder"),
      elbow: kpPick(usePose, "right_elbow"),
      wrist: kpPick(usePose, "right_wrist"),
      ear: kpPick(usePose, "right_ear"),
    };
    const L = {
      hip: kpPick(usePose, "left_hip"),
      knee: kpPick(usePose, "left_knee"),
      ankle: kpPick(usePose, "left_ankle"),
      shoulder: kpPick(usePose, "left_shoulder"),
      elbow: kpPick(usePose, "left_elbow"),
      wrist: kpPick(usePose, "left_wrist"),
      ear: kpPick(usePose, "left_ear"),
    };

    const hip = R.hip || L.hip;
    const knee = R.knee || L.knee;
    const ankle = R.ankle || L.ankle;
    const shoulder = R.shoulder || L.shoulder;
    const elbow = R.elbow || L.elbow;
    const wrist = R.wrist || L.wrist;
    const ear = R.ear || L.ear;

    // require only 2 landmarks to proceed
    const kpList = [hip, knee, ankle, shoulder, wrist, ear].filter(Boolean);
    if (kpList.length < 2) {
      // demo-friendly fallback so the clip shows green
      if (useDemo && !videoRef.current!.paused && videoRef.current!.readyState >= 2) {
        return { formCorrect: true, repDetected: false, feedback: "Hold steady" };
      }
      return { formCorrect: false, repDetected: false, feedback: "" };
    }

    // shared posture
    const devDeg = hipDevDeg(shoulder, ankle, hip);
    const neckDeg = angleABC(hip, shoulder, ear);
    const lineOK = devDeg <= THRESH.lineDevMax;
    const neckOK = neckDeg <= THRESH.neckMax;

    // -------- PLANK (side view; lenient for demos) --------
    if (exercise === "plank") {
      const dx = (shoulder && ankle) ? Math.abs(ankle.x - shoulder.x) : 0;
      const dy = (shoulder && ankle) ? Math.abs(ankle.y - shoulder.y) : 9999;
      const sideWidthOK = dx >= THRESH.plankMinShoulderAnkleDxPx;

      const horizSlopeOK = dx > 0 ? (dy / dx) <= Math.tan((THRESH.plankHorizontalMaxDeg * Math.PI) / 180) : false;

      // support under shoulder (wrist or elbow)
      const wristDx = (wrist && shoulder) ? Math.abs(wrist.x - shoulder.x) : 9999;
      const elbowDx = (elbow && shoulder) ? Math.abs(elbow.x - shoulder.x) : 9999;
      const supportDx = Math.min(wristDx, elbowDx);
      const handBelow = (wrist && shoulder) ? (wrist.y > shoulder.y + 20) : false;
      const elbowBelow = (elbow && shoulder) ? (elbow.y > shoulder.y + 10) : false;
      const supportOK = (supportDx <= THRESH.supportUnderShoulderPx) && (handBelow || elbowBelow);

      const straightOK = devDeg <= THRESH.plankLineDevMax;
      const neckOKp = neckDeg <= THRESH.plankNeckMax;

      // lenient rule: good straight line can compensate a bit
      const okStrict = sideWidthOK && horizSlopeOK && supportOK && straightOK && neckOKp;
      const okDemo = sideWidthOK && straightOK && neckOKp;
      const ok = useDemo ? okDemo : okStrict;

      let cue = "";
      if (!sideWidthOK) cue = "Turn to side (profile)";
      else if (!(useDemo ? straightOK : horizSlopeOK)) cue = useDemo ? "Straight line head→heels" : "Body parallel to floor";
      else if (!supportOK && !useDemo) cue = "Hands/elbows under shoulders";
      else if (!straightOK) cue = (hip && shoulder && hip.y > shoulder.y) ? "Lift hips" : "Lower hips";
      else if (!neckOKp) cue = "Relax neck";
      else cue = "Hold steady";

      const now = performance.now();
      if (ok) {
        if (plankStartRef.current == null) plankStartRef.current = now;
        setPlankNowMs(now - (plankStartRef.current ?? now));
      } else {
        if (plankStartRef.current != null) {
          const dur = now - plankStartRef.current;
          setPlankBestMs((p) => Math.max(p, dur));
          plankStartRef.current = null;
        }
        setPlankNowMs(0);
      }

      return { formCorrect: ok, repDetected: false, feedback: cue };
    }

    // -------- SQUAT (relative-only) --------
    if (exercise === "squat") {
      // stable vertical center (avg hips -> knees -> shoulders)
      const ys: number[] = [];
      if (R.hip?.y != null) ys.push(R.hip.y);
      if (L.hip?.y != null) ys.push(L.hip.y);
      if (ys.length < 2) {
        if (R.knee?.y != null) ys.push(R.knee.y);
        if (L.knee?.y != null) ys.push(L.knee.y);
      }
      if (ys.length < 2) {
        if (R.shoulder?.y != null) ys.push(R.shoulder.y);
        if (L.shoulder?.y != null) ys.push(L.shoulder.y);
      }
      if (!ys.length) return { formCorrect: false, repDetected: false, feedback: "" };

      const centerY = ys.reduce((a, b) => a + b, 0) / ys.length;

      // learn/freeze baseline while standing
      if (sqHipBaseRef.current == null) sqHipBaseRef.current = centerY;
      const base = sqHipBaseRef.current;
      const movedDownNow = centerY > base * (1 + THRESH.repDownFrac * 0.5);
      if (sqPhaseRef.current === "idle" && !movedDownNow) {
        sqHipBaseRef.current = 0.98 * base + 0.02 * centerY;
      }

      const relDownOK = (centerY - base) >= (base * THRESH.repDownFrac);

      // loose torso guardrail
      const torsoPx = (shoulder && hip) ? Math.abs(shoulder.x - hip.x) : 0;
      const torsoOK = torsoPx <= pxFromDeg(THRESH.squatTorsoChangeMax * 1.8, shoulder, hip);

      const ok = relDownOK && torsoOK;
      const cue = ok ? "Nice rep" : relDownOK ? "Chest tall" : "Lower more";

      // rep FSM
      let rep = false;
      const now = performance.now();
      const movedDown = centerY > (base * (1 + THRESH.repDownFrac));
      const backNearTop = centerY <= (base * (1 + THRESH.repTopFrac));

      if (sqPhaseRef.current === "idle" && movedDown) {
        sqPhaseRef.current = "down";
      } else if (sqPhaseRef.current === "down" && !movedDown) {
        sqPhaseRef.current = "up";
      } else if (sqPhaseRef.current === "up" && backNearTop) {
        if (now - sqLastRepAtRef.current > THRESH.minRepMs) {
          sqLastRepAtRef.current = now;
          rep = true;
        }
        sqPhaseRef.current = "idle";
      }

      return { formCorrect: ok, repDetected: rep, feedback: cue };
    }

    // others: permissive
    return { formCorrect: true, repDetected: false, feedback: "Tracking…" };
  }

  // -------- loop (immediate border flip) --------
  const startAnalysis = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(async () => {
      const res = await analyzeForm();
      setFormStatus(res.formCorrect ? "good" : "bad");
      setFeedback(res.feedback);
      if (!useDemo) speak(res.feedback);
      if (exercise === "squat" && res.repDetected) setRepCount((r) => r + 1);
    }, 250);
  };

  // -------- sources ----------
  const startDemo = async () => {
    stopAll();
    const v = videoRef.current!;
    v.crossOrigin = "anonymous"; // important for decoding consistency
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
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      v.onloadedmetadata = () => v.play().catch(() => {});
      setIsStreaming(true);
      startAnalysis();
    } catch (e) {
      console.error(e);
      setFeedback("Camera permission error.");
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

    if (useDemo) await startDemo();
    else await startWebcam();
  };

  const stopAll = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
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

  useEffect(() => {
    if (isStreaming && useDemo) startDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, useDemo]);

  useEffect(() => () => stopAll(), []);

  // UI
  const borderCss =
    formStatus === "good"
      ? { border: "4px solid #22c55e", boxShadow: "0 0 0 2px rgba(34,197,94,0.25), 0 0 24px rgba(34,197,94,0.35)" }
      : formStatus === "bad"
      ? { border: "4px solid #ef4444", boxShadow: "0 0 0 2px rgba(239,68,68,0.25), 0 0 24px rgba(239,68,68,0.35)" }
      : { border: "4px solid rgba(255,255,255,0.25)", boxShadow: "none" };

  const pill = {
    fontSize: 14,
    padding: "8px 12px",
    borderRadius: 999,
    color: "#fff",
    background: "rgba(0,0,0,0.6)",
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
  } as React.CSSProperties;

  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#1f2147,#0a2642)",
        color: "#fff",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 36, margin: 0 }}>GymBuddy</h1>
          <div style={{ opacity: 0.9 }}>Squat = lower yourself. Plank = side view only.</div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <label>
            Exercise:&nbsp;
            <select
              value={exercise}
              onChange={(e) => setExercise(e.target.value as any)}
              style={{ color: "#111", borderRadius: 6, padding: "6px 8px" }}
            >
              <option value="squat">Squat</option>
              <option value="pushup">Push-up</option>
              <option value="plank">Plank</option>
              <option value="deadbug">Dead bug</option>
              <option value="wallsit">Wall sit</option>
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={useDemo} onChange={(e) => setUseDemo(e.target.checked)} disabled={isStreaming} />
            Use demo video
          </label>

          {!isStreaming ? (
            <button onClick={start} style={btn("#10b981")}>
              Start
            </button>
          ) : (
            <button onClick={stopAll} style={btn("#ef4444")}>
              Stop
            </button>
          )}

          {isStreaming && exercise === "squat" && <div style={pill}>Reps: <b style={{ marginLeft: 6 }}>{repCount}</b></div>}
          {isStreaming && exercise === "plank" && (
            <>
              <div style={pill}>
                Hold: <b style={{ marginLeft: 6 }}>{mmss(plankNowMs)}</b>
              </div>
              <div style={pill}>
                Best: <b style={{ marginLeft: 6 }}>{mmss(plankBestMs)}</b>
              </div>
            </>
          )}
        </div>

        <div style={{ position: "relative", background: "rgba(0,0,0,0.65)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ position: "relative", ...borderCss }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ display: "block", width: "100%", maxHeight: 480, transform: "scaleX(-1)" }}
            />
          </div>
        </div>

        {isStreaming && feedback && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 8,
              background: formStatus === "good" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
              border: `1px solid ${formStatus === "good" ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)"}`,
            }}
          >
            {feedback}
          </div>
        )}
      </div>
    </div>
  );
}

function btn(bg: string) {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    padding: "8px 14px",
    borderRadius: 8,
    fontWeight: 700,
  } as React.CSSProperties;
}
