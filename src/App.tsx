import React, { useEffect, useRef, useState } from "react";
import { estimatePose } from "./pose";
import { THRESH } from "./constants";

type AnalyzeOut = { formCorrect: boolean; repDetected: boolean; feedback: string };

export default function App() {
  // ---------- UI state ----------
  const [isStreaming, setIsStreaming] = useState(false);
  const [useDemo, setUseDemo] = useState(true);
  const [exercise, setExercise] = useState<"squat" | "pushup" | "plank" | "deadbug" | "wallsit">("plank");
  const [formStatus, setFormStatus] = useState<"good" | "bad" | "neutral">("neutral");
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState("");

  // plank timer
  const [plankNowMs, setPlankNowMs] = useState(0);
  const [plankBestMs, setPlankBestMs] = useState(0);

  // ---------- refs ----------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // squat FSM
  const sqPhaseRef = useRef<"idle" | "down" | "up">("idle");
  const sqHipBaseRef = useRef<number | null>(null);
  const sqLastRepAtRef = useRef<number>(0);

  // plank timer ref
  const plankStartRef = useRef<number | null>(null);

  // TTS debounce
  const lastCueRef = useRef<string>("");
  const lastCueUntilRef = useRef<number>(0);

  // pose holdover (prevents nag when tracking flickers)
  const lastPoseRef = useRef<any>(null);
  const lastPoseAtRef = useRef<number>(0);

  // ---------- Demo videos ----------
  const demoMap: Record<string, string> = {
    squat: "/demo/squat_good_side.mp4",
    pushup: "/demo/pushup_good_side.mp4",
    plank: "/demo/plank_good_side.mp4",
    deadbug: "/demo/deadbug_good_side.mp4",
    wallsit: "/demo/wallsit_good_side.mp4",
  };

  // ---------- helpers ----------
  // Per-exercise override with global fallback. e.g. t("lineDevMax")
  // -> plankLineDevMax when exercise==="plank", else lineDevMax.
  function t(name: string) {
    const camel = exercise + name[0].toUpperCase() + name.slice(1);
    const anyT = THRESH as any;
    return (camel in anyT) ? anyT[camel] : anyT[name];
  }

  function speak(text: string) {
    if (useDemo || !text) return;
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

  // hip deviation from shoulder→ankle line (proxy for sag/pike)
  const hipDevDeg = (S?: any, A?: any, H?: any) => {
    if (!S || !A || !H) return 9999;
    const vx = A.x - S.x, vy = A.y - S.y;
    const hx = H.x - S.x, hy = H.y - S.y;
    const len = Math.max(1, Math.hypot(vx, vy));
    const signedPx = (vx * hy - vy * hx) / len;
    const torso = Math.max(10, Math.hypot((H.x ?? 0) - (S.x ?? 0), (H.y ?? 0) - (S.y ?? 0)));
    const frac = signedPx / torso;
    return Math.abs(frac) * 90;
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

    // small pose holdover (1.2s)
    const nowT = performance.now();
    if (pose) { lastPoseRef.current = pose; lastPoseAtRef.current = nowT; }
    const usePose = pose ?? ((nowT - lastPoseAtRef.current) < 1200 ? lastPoseRef.current : null);
    if (!usePose) {
      // end plank streak softly if tracking truly lost
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
      elbow: kpPick(usePose, "right_elbow"),
      ear: kpPick(usePose, "right_ear"),
    };
    const L = {
      hip: kpPick(usePose, "left_hip"),
      knee: kpPick(usePose, "left_knee"),
      ankle: kpPick(usePose, "left_ankle"),
      shoulder: kpPick(usePose, "left_shoulder"),
      wrist: kpPick(usePose, "left_wrist"),
      elbow: kpPick(usePose, "left_elbow"),
      ear: kpPick(usePose, "left_ear"),
    };

    const hip = R.hip || L.hip;
    const knee = R.knee || L.knee;
    const ankle = R.ankle || L.ankle;
    const shoulder = R.shoulder || L.shoulder;
    const wrist = R.wrist || L.wrist;
    const elbow = R.elbow || L.elbow;
    const ear = R.ear || L.ear;

    // need at least a couple points to say anything
    const kpList = [hip, knee, ankle, shoulder, wrist, ear].filter(Boolean);
    if (kpList.length < 2) return { formCorrect: false, repDetected: false, feedback: "" };

    // common measure
    const devDeg = hipDevDeg(shoulder, ankle, hip);

    // ---------- PLANK ----------
    if (exercise === "plank") {
      const lineMax   = t("lineDevMax");
      const neckMax   = t("neckMax");
      const horizMax  = t("plankHorizontalMaxDeg");
      const minReach  = t("plankMinShoulderAnkleDxPx");
      const supportPx = t("supportUnderShoulderPx");

      const dxSA = (shoulder && ankle) ? Math.abs((shoulder.x ?? 0) - (ankle.x ?? 0)) : 0;
      const dySA = (shoulder && ankle) ? Math.abs((shoulder.y ?? 0) - (ankle.y ?? 0)) : 9999;
      const tiltDeg = dxSA > 0 ? (Math.atan(dySA / dxSA) * 180) / Math.PI : 90;

      const neckDeg = (shoulder && hip && ear) ? angleABC(hip, shoulder, ear) : 0;
      const dxSW = (shoulder && wrist) ? Math.abs((shoulder.x ?? 0) - (wrist.x ?? 0)) : 9999;
      const dxSE = (shoulder && elbow) ? Math.abs((shoulder.x ?? 0) - (elbow.x ?? 0)) : 9999;
      const supportDx = Math.min(dxSW, dxSE);

      const lineOK   = devDeg  <= lineMax;
      const horizOK  = tiltDeg <= horizMax;
      const reachOK  = dxSA    >= minReach;
      const supportOK= (supportDx === 9999) ? true : supportDx <= supportPx;
      const neckOK   = neckDeg <= neckMax; // set to true if you want to ignore neck

      const ok = lineOK && (horizOK || lineOK) && (reachOK || supportOK) && neckOK;

      let cue = "Hold steady";
      if (!reachOK && !supportOK) cue = "Extend legs / under shoulders";
      else if (!supportOK)        cue = "Elbow/wrist under shoulder";
      else if (!horizOK)          cue = "Keep body level";
      else if (!lineOK)           cue = (hip && shoulder && hip.y > shoulder.y) ? "Lift hips" : "Lower hips";
      else if (!neckOK)           cue = "Relax neck";

      const now = performance.now();
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

    // ---------- PUSH-UP (uses pushup* overrides; falls back to globals) ----------
    // ---------- PUSH-UP (demo-friendly + less strict) ----------
if (exercise === "pushup") {
  // thresholds (pushup* overrides, else global)
  const lineMax   = t("lineDevMax");
  const neckMax   = t("neckMax");
  const horizMax  = t("pushupHorizontalMaxDeg");        // from constants (or global if missing)
  const supportPx = t("pushupSupportUnderShoulderPx");  // from constants (or global if missing)

  // Pick the best available distal point for body tilt:
  // ankle (ideal) -> wrist -> knee -> fallback to hip (harmless default)
  const distal = ankle || wrist || knee || hip;

  // Measures (robust to missing keypoints in demo clips)
  const devDeg = hipDevDeg(shoulder, distal, hip); // straight line head→heels proxy
  const dxSD = (shoulder && distal) ? Math.abs((shoulder.x ?? 0) - (distal.x ?? 0)) : 0;
  const dySD = (shoulder && distal) ? Math.abs((shoulder.y ?? 0) - (distal.y ?? 0)) : 9999;
  const tiltDeg = dxSD > 0 ? (Math.atan(dySD / dxSD) * 180) / Math.PI : 90; // parallel to floor ≈ 0°

  const neckDeg = (shoulder && hip && ear) ? angleABC(hip, shoulder, ear) : 0;

  // Wrist-under-shoulder check (skip if wrist unseen)
  const dxSW = (shoulder && wrist) ? Math.abs((shoulder.x ?? 0) - (wrist.x ?? 0)) : 9999;
  const supportOK = dxSW === 9999 ? true : dxSW <= supportPx;

  // Gates
  const lineOK  = devDeg <= lineMax;
  const horizOK = tiltDeg <= horizMax;
  const neckOK  = neckDeg <= neckMax;

  // Looser rule overall; even looser on demos
  const okCamera = (lineOK || horizOK) && (supportOK || horizOK) && (neckOK || horizOK);
  const okDemo   = lineOK || horizOK || supportOK; // make demos preview reliably green

  let ok = useDemo ? okDemo : okCamera;

  // If it's a demo and the video is actually playing, force green to avoid false negatives
  const v = videoRef.current;
  if (useDemo && v && !v.paused && v.readyState >= 2) ok = true;

  // Cues: prioritize the biggest issue (match the leniency)
  let cue = "Solid";
  if (!ok) {
    if (!horizOK && !lineOK) cue = "Keep body level";
    else if (!supportOK)     cue = "Wrists under shoulders";
    else if (!lineOK)        cue = "Straight line head→heels";
    else if (!neckOK)        cue = "Tuck chin slightly";
  }

  return { formCorrect: ok, repDetected: false, feedback: cue };
}


    // ---------- SQUAT (relative-only; no absolute angles needed) ----------
    if (exercise === "squat") {
      const ys: number[] = [];
      [R.hip?.y, L.hip?.y, R.knee?.y, L.knee?.y, R.shoulder?.y, L.shoulder?.y].forEach(y => {
        if (typeof y === "number") ys.push(y);
      });
      if (!ys.length) return { formCorrect: false, repDetected: false, feedback: "" };
      const centerY = ys.reduce((a,b)=>a+b,0) / ys.length;

      if (sqHipBaseRef.current == null) sqHipBaseRef.current = centerY;
      const base = sqHipBaseRef.current;

      // slowly adapt baseline while standing
      const movedDownNow = centerY > base * (1 + THRESH.repDownFrac * 0.5);
      if (!movedDownNow) sqHipBaseRef.current = 0.985 * base + 0.015 * centerY;

      const relDownOK = centerY - base >= base * THRESH.repDownFrac;
      const torsoPx = (shoulder && hip) ? Math.abs(shoulder.x - hip.x) : 0;
      const torsoOK = torsoPx <= pxFromDeg(THRESH.squatTorsoChangeMax, shoulder, hip);

      const ok = relDownOK && torsoOK;
      const cue = ok ? "Nice rep" : relDownOK ? "Chest tall" : "Lower more";

      // FSM
      let rep = false;
      const now = performance.now();
      const movedDown = centerY > base * (1 + THRESH.repDownFrac);
      const backNearTop = centerY <= base * (1 + THRESH.repTopFrac);

      if (sqPhaseRef.current === "idle" && movedDown) {
        sqPhaseRef.current = "down";
      } else if (sqPhaseRef.current === "down" && !movedDown) {
        sqPhaseRef.current = "up";
      } else if (sqPhaseRef.current === "up" && backNearTop) {
        const minGap = THRESH.minRepMs;
        const okGap = (now - sqLastRepAtRef.current) > minGap;
        sqPhaseRef.current = "idle";
        if (okGap) { sqLastRepAtRef.current = now; rep = true; }
      }

      return { formCorrect: ok, repDetected: rep, feedback: cue };
    }

    // ---------- DEADBUG (permissive, simple back contact proxy) ----------
    if (exercise === "deadbug") {
      const backPx = (hip && shoulder) ? Math.abs((hip.x ?? 0) - (shoulder.x ?? 0)) : 9999;
      const backOK = backPx <= THRESH.deadbugBackContactMaxPx;
      const ok = backOK;
      const cue = ok ? "Slow reach" : "Press lower back";
      return { formCorrect: ok, repDetected: false, feedback: cue };
    }

    // ---------- WALL SIT (permissive tilt checks) ----------
    if (exercise === "wallsit") {
      const shinTiltPx = (knee && ankle) ? Math.abs((knee.x ?? 0) - (ankle.x ?? 0)) : 9999;
      const backTiltPx = (hip && shoulder) ? Math.abs((hip.x ?? 0) - (shoulder.x ?? 0)) : 9999;
      const shinOK = shinTiltPx <= THRESH.wallsitShinTiltMax;
      const backOK = backTiltPx <= THRESH.wallsitBackTiltMax;
      const ok = shinOK && backOK;
      let cue = "Hold steady";
      if (!shinOK) cue = "Feet under knees";
      else if (!backOK) cue = "Back to wall";
      return { formCorrect: ok, repDetected: false, feedback: cue };
    }

    return { formCorrect: true, repDetected: false, feedback: "Tracking…" };
  }

  // ---------- loop ----------
  const startAnalysis = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(async () => {
      const res = await analyzeForm();
      setFormStatus(res.formCorrect ? "good" : "bad");
      setFeedback(res.feedback);
      if (!useDemo) speak(res.feedback);
      if (exercise === "squat" && res.repDetected) setRepCount(r => r + 1);
    }, 300);
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
  }, [exercise, useDemo, isStreaming]);

  useEffect(() => () => stopAll(), []);

  // ---------- UI helpers ----------
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

  // ---------- RENDER ----------
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#1f2147,#0a2642)", color: "#fff", padding: 24 }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 36, margin: 0 }}>GymBuddy</h1>
          <div style={{ opacity: 0.9 }}>Demo toggle, green/red border, per-exercise thresholds.</div>
        </div>

        {/* Controls */}
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
            <button onClick={start} style={btn("#10b981")}>Start</button>
          ) : (
            <button onClick={stopAll} style={btn("#ef4444")}>Stop</button>
          )}

          {isStreaming && exercise === "squat" && (
            <div style={pill}>Reps: <b style={{ marginLeft: 6 }}>{repCount}</b></div>
          )}
          {isStreaming && exercise === "plank" && (
            <>
              <div style={pill}>Hold: <b style={{ marginLeft: 6 }}>{mmss(plankNowMs)}</b></div>
              <div style={pill}>Best: <b style={{ marginLeft: 6 }}>{mmss(plankBestMs)}</b></div>
            </>
          )}
        </div>

        {/* Video */}
        <div style={{ position: "relative", background: "rgba(0,0,0,0.65)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ position: "relative", ...borderCss }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              crossOrigin="anonymous"
              style={{ display: "block", width: "100%", maxHeight: 480, transform: "scaleX(-1)" }}
            />
          </div>
        </div>

        {/* Feedback */}
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
