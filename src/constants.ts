export const THRESH = {
  // ---------- Generic timing ----------
  holdSecondGreenFrac: 0.60,

  // ---------- Posture windows ----------
  lineDevMax: 14,   // (deg) hip deviation from shoulder→ankle line
  neckMax: 28,      // (deg) neck flexion

  // ---------- Squat (DO NOT CHANGE per your request) ----------
  repDownFrac: 0.06,
  repTopFrac: 0.03,
  squatDepthMin: 150,
  squatDepthMax: 175,
  squatTorsoChangeMax: 30, // (deg proxy) "chest tall"
  kneeCaveFrac: 0.25,

  // ---------- Push-up ----------
  pushupDepthElbowMax: 110,

  // ---------- Dead bug ----------
  deadbugBackContactMaxPx: 55,
  deadbugLimbSpeedMaxPx: 14,

  // ---------- Wall sit ----------
  wallsitShinTiltMax: 14,
  wallsitBackTiltMax: 14,

  // ---------- Misc ----------
  minKPScore: 0.25,
  cueHoldMs: 800,

  // NEW: status latch to stabilize border color
  goodFramesToGreen: 2,   // need 4 consecutive OK frames to turn green
  badFramesToRed: 6       // need 4 consecutive NOT-OK frames to turn red
} as const;
