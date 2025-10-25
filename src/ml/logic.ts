import { indexKeypoints, kneeAngle, elbowAngle, torsoTilt, neckAngle,
         pointDeviationFromLine, smooth, PoseMap, KP } from "./features";
import { indexKeypoints, kneeAngle, elbowAngle, torsoTilt, neckAngle,
         pointDeviationFromLine, smooth, PoseMap, KP,
         stanceWidthRatio, toeOutAngles } from "./features";

export type FrameOut = {
  t: number,
  angles: { knee?: number, elbow?: number, torso?: number },
  signals: { hipHeight?: number, lineDeviation?: number, backContact?: number },
  cue?: string
};

export type EventOut =
  | { kind: "rep", index: number, green: boolean, cue?: string }
  | { kind: "sec", index: number, green: boolean, cue?: string };

type Exercise = "squat"|"pushup"|"plank"|"deadbug"|"wallsit";

import { THRESH } from "./constants";

type State = {
  started: boolean,
  t0: number,
  // calibration
  hipStart?: number,
  // generic counters
  repIndex: number,
  cueHold: { text: string, until: number } | null,
  // squat
  phase?: "idle"|"down"|"up",
  // pushup
  pPhase?: "idle"|"down"|"up",
  // plank and wall sit
  secBox?: { bucket: number, good: number, total: number, secs: number },
  wsSecBox?: { bucket: number, good: number, total: number, secs: number },
  // dead bug
  dbPrev?: KP, dbDir?: "out"|"in", dbLastD?: number
};

const state: Record<Exercise, State> = {
  squat:   { started:false, t0:0, repIndex:0, cueHold:null },
  pushup:  { started:false, t0:0, repIndex:0, cueHold:null },
  plank:   { started:false, t0:0, repIndex:0, cueHold:null },
  deadbug: { started:false, t0:0, repIndex:0, cueHold:null },
  wallsit: { started:false, t0:0, repIndex:0, cueHold:null },
};

function setCue(st: State, text: string) {
  // debounce for about two frames at 30 fps
  const now = performance.now();
  if (!st.cueHold || st.cueHold.text !== text || now > st.cueHold.until) {
    st.cueHold = { text, until: now + 10000 };
  }
  return st.cueHold.text;
}

export function evaluateFrame(
  pose: { keypoints: KP[] } | null,
  exercise: Exercise
): { frame: FrameOut, event?: EventOut } {
  const st = state[exercise];
  const now = performance.now();
  if (!st.started) { st.started = true; st.t0 = now; }

  let frame: FrameOut = { t: now - st.t0, angles: {}, signals: {} };
  let event: EventOut | undefined;

  if (!pose) return { frame, event };

  const m: PoseMap = indexKeypoints(pose);

  // shared angles
  const knee = kneeAngle(m);
  const elbow = elbowAngle(m);
  const torso = torsoTilt(m);

  frame.angles = { knee, elbow, torso };

  if (exercise === "squat") {
    ({ frame, event } = squatLogic(m, st, frame));
  } else if (exercise === "pushup") {
    ({ frame, event } = pushupLogic(m, st, frame));
  } else if (exercise === "plank") {
    ({ frame, event } = plankLogic(m, st, frame));
  } else if (exercise === "deadbug") {
    ({ frame, event } = deadbugLogic(m, st, frame));
  } else if (exercise === "wallsit") {
    ({ frame, event } = wallsitLogic(m, st, frame));
  }

  return { frame, event };
}

// 1. Squat
function squatLogic(m: PoseMap, st: State, frame: FrameOut) {
  const knee = smooth("sq_knee", kneeAngle(m));
  const torso = smooth("sq_torso", torsoTilt(m));
  const hipY = smooth("sq_hipY", m.hip?.y ?? NaN);

  if (st.hipStart === undefined && isFinite(hipY)) st.hipStart = hipY;

  const movedDown = st.hipStart !== undefined && hipY > st.hipStart * (1 + THRESH.repDownFrac);
  const backNearTop = st.hipStart !== undefined && hipY <= st.hipStart * (1 + THRESH.repTopFrac);

  const depthGreen = knee >= THRESH.squatDepthMin && knee <= THRESH.squatDepthMax;
  const torsoOK = Math.abs(torso) <= THRESH.squatTorsoChangeMax;

  // knee tracking by x positions
  const hipX = m.hip?.x ?? 0, kneeX = m.knee?.x ?? 0, ankleX = m.ankle?.x ?? 0;
  const hipAnkleDist = Math.abs(hipX - ankleX) || 1;
  const kneeInside = kneeX < ankleX - THRESH.kneeCaveFrac * hipAnkleDist;
  const kneesOK = !kneeInside;

  // cue
  if (!depthGreen) frame.cue = setCue(st, knee > THRESH.squatDepthMax ? "Go a little deeper" : "Depth very deep, rise slightly");
  else if (!kneesOK) frame.cue = setCue(st, "Push knees out");
  else if (!torsoOK) frame.cue = setCue(st, "Keep chest up");
  else frame.cue = "";

  // rep state
  if (st.phase === undefined) st.phase = "idle";
  if (st.phase === "idle" && movedDown) st.phase = "down";
  if (st.phase === "down" && depthGreen && !movedDown) st.phase = "up";
  if (st.phase === "up" && backNearTop) {
    st.repIndex += 1;
    const green = depthGreen && kneesOK && torsoOK;
    const ev: EventOut = { kind: "rep", index: st.repIndex, green, cue: green ? undefined : frame.cue };
    st.phase = "idle";
    return { frame, event: ev };
  }

  frame.signals.hipHeight = st.hipStart ? hipY - st.hipStart : undefined;
  return { frame, event: undefined };
}

// 2. Pushup
function pushupLogic(m: PoseMap, st: State, frame: FrameOut) {
  const elbow = smooth("pu_elbow", elbowAngle(m));
  const lineDev = smooth("pu_line", lineDeviation(m));
  const neck = smooth("pu_neck", neckAngle(m));

  const depthGreen = elbow <= THRESH.pushupDepthElbowMax;
  const lineOK = lineDev <= THRESH.lineDevMax;
  const neckOK = neck <= THRESH.neckMax;

  if (!depthGreen) frame.cue = setCue(st, "Go a bit lower");
  else if (!lineOK) frame.cue = setCue(st, "Keep a straight line");
  else if (!neckOK) frame.cue = setCue(st, "Tuck chin slightly");
  else frame.cue = "";

  if (st.pPhase === undefined) st.pPhase = "idle";
  if (st.pPhase === "idle" && !depthGreen) st.pPhase = "up";
  if (st.pPhase === "up" && depthGreen) st.pPhase = "down";
  if (st.pPhase === "down" && !depthGreen) {
    st.repIndex += 1;
    const green = lineOK && neckOK;
    const ev: EventOut = { kind: "rep", index: st.repIndex, green, cue: green ? undefined : frame.cue };
    st.pPhase = "idle";
    frame.signals.lineDeviation = lineDev;
    return { frame, event: ev };
  }

  frame.signals.lineDeviation = lineDev;
  return { frame, event: undefined };
}

function lineDeviation(m: PoseMap) {
  const s = m.shoulder, a = m.ankle, h = m.hip;
  return pointDeviationFromLine(s, a, h); // deviation at the hip from shoulder to ankle line
}

// 3. Plank
function plankLogic(m: PoseMap, st: State, frame: FrameOut) {
  const lineDev = smooth("pl_line", lineDeviation(m));
  const neck = smooth("pl_neck", neckAngle(m));
  const shouldersOverWrists = wristsUnderShoulders(m);

  const ok = lineDev <= THRESH.lineDevMax && neck <= THRESH.neckMax && shouldersOverWrists;

  // per second accounting
  const bucket = Math.floor(performance.now() / 1000);
  if (!st.secBox) st.secBox = { bucket, good: 0, total: 0, secs: 0 };
  if (st.secBox.bucket !== bucket) {
    const green = st.secBox.total > 0 && st.secBox.good / st.secBox.total >= THRESH.holdSecondGreenFrac;
    if (green) {
      st.secBox.secs += 1;
      const ev: EventOut = { kind: "sec", index: st.secBox.secs, green: true };
      st.secBox.bucket = bucket; st.secBox.good = 0; st.secBox.total = 0;
      frame.signals.lineDeviation = lineDev;
      // set cue for next second based on which failed
      if (!ok) {
        if (lineDev > THRESH.lineDevMax) frame.cue = setCue(st, m.hip && m.shoulder && m.hip.y > m.shoulder.y ? "Lift hips slightly" : "Lower hips slightly");
        else if (!shouldersOverWrists) frame.cue = setCue(st, "Bring shoulders over wrists");
        else if (neck > THRESH.neckMax) frame.cue = setCue(st, "Relax neck");
        else frame.cue = "";
      } else frame.cue = "";
      return { frame, event: ev };
    }
    st.secBox.bucket = bucket; st.secBox.good = 0; st.secBox.total = 0;
  }
  st.secBox.total += 1;
  if (ok) st.secBox.good += 1;

  frame.signals.lineDeviation = lineDev;
  if (!ok) {
    if (lineDev > THRESH.lineDevMax) frame.cue = setCue(st, m.hip && m.shoulder && m.hip.y > m.shoulder.y ? "Lift hips slightly" : "Lower hips slightly");
    else if (!shouldersOverWrists) frame.cue = setCue(st, "Bring shoulders over wrists");
    else if (neck > THRESH.neckMax) frame.cue = setCue(st, "Relax neck");
  } else frame.cue = "";
  return { frame, event: undefined };
}

function wristsUnderShoulders(m: PoseMap) {
  if (!m.wrist || !m.shoulder) return true;
  const dx = Math.abs(m.wrist.x - m.shoulder.x);
  return dx < 40; // pixels, tune with your video
}

// 4. Dead bug
function deadbugLogic(m: PoseMap, st: State, frame: FrameOut) {
  // back contact proxy: horizontal offset hip to shoulder
  const back = smooth("db_back", Math.abs((m.hip?.x ?? 0) - (m.shoulder?.x ?? 0)));
  const backOK = back < THRESH.deadbugBackContactMaxPx;

  // limb speed
  const p = m.wrist || m.ankle || m.knee;
  const prev = st.dbPrev || p;
  const speed = p ? Math.hypot(p.x - (prev?.x ?? p.x), p.y - (prev?.y ?? p.y)) : 0;
  st.dbPrev = p || prev;
  const slowEnough = speed < THRESH.deadbugLimbSpeedMaxPx;

  if (!backOK) frame.cue = setCue(st, "Press lower back into floor");
  else if (!slowEnough) frame.cue = setCue(st, "Slower reach");
  else frame.cue = "";

  // alternating reps on wrist to hip distance wave
  const d = p && m.hip ? Math.hypot(p.x - m.hip.x, p.y - m.hip.y) : 0;
  const dSm = smooth("db_wave", d);
  if (!st.dbDir && dSm > (st.dbLastD ?? dSm)) st.dbDir = "out";
  if (st.dbDir === "out" && dSm < (st.dbLastD ?? dSm)) {
    if (backOK && slowEnough) {
      st.repIndex += 1;
      const ev: EventOut = { kind: "rep", index: st.repIndex, green: true };
      st.dbDir = "in";
      st.dbLastD = dSm;
      frame.signals.backContact = back;
      return { frame, event: ev };
    }
    st.dbDir = "in";
  }
  st.dbLastD = dSm;

  frame.signals.backContact = back;
  return { frame, event: undefined };
}

// 5. Wall sit
function wallsitLogic(m: PoseMap, st: State, frame: FrameOut) {
  const knee = smooth("ws_knee", kneeAngle(m));
  const shinTilt = smooth("ws_shin", shinAngle(m));
  const backTilt = smooth("ws_back", backVerticality(m));

  const depthOK = knee >= THRESH.squatDepthMin && knee <= THRESH.squatDepthMax;
  const shinOK = Math.abs(shinTilt) <= THRESH.wallsitShinTiltMax;
  const backOK = Math.abs(backTilt) <= THRESH.wallsitBackTiltMax;
  const ok = depthOK && shinOK && backOK;

  if (!depthOK) frame.cue = setCue(st, knee > THRESH.squatDepthMax ? "Slide down a little" : "Rise slightly");
  else if (!shinOK) frame.cue = setCue(st, "Keep feet under knees");
  else if (!backOK) frame.cue = setCue(st, "Keep back against the wall");
  else frame.cue = "";

  // per second accounting
  const bucket = Math.floor(performance.now() / 1000);
  if (!st.wsSecBox) st.wsSecBox = { bucket, good: 0, total: 0, secs: 0 };
  if (st.wsSecBox.bucket !== bucket) {
    const green = st.wsSecBox.total > 0 && st.wsSecBox.good / st.wsSecBox.total >= THRESH.holdSecondGreenFrac;
    if (green) {
      st.wsSecBox.secs += 1;
      const ev: EventOut = { kind: "sec", index: st.wsSecBox.secs, green: true };
      st.wsSecBox.bucket = bucket; st.wsSecBox.good = 0; st.wsSecBox.total = 0;
      return { frame, event: ev };
    }
    st.wsSecBox.bucket = bucket; st.wsSecBox.good = 0; st.wsSecBox.total = 0;
  }
  st.wsSecBox.total += 1;
  if (ok) st.wsSecBox.good += 1;

  return { frame, event: undefined };
}

function shinAngle(m: PoseMap) {
  if (!m.knee || !m.ankle) return 0;
  const dy = m.knee.y - m.ankle.y;
  const dx = m.knee.x - m.ankle.x;
  return Math.atan2(dx, dy) * 180 / Math.PI; // zero is vertical
}

function backVerticality(m: PoseMap) {
  if (!m.hip || !m.shoulder) return 0;
  // horizontal offset maps to tilt
  const dx = Math.abs(m.hip.x - m.shoulder.x);
  return dx * 0.2; // scale to degrees, tune on your video
}
export function resetExercise(ex: "squat"|"pushup"|"plank"|"deadbug"|"wallsit") {
  state[ex] = { started:false, t0:0, repIndex:0, cueHold:null };
}
