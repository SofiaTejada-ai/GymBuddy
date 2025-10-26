export const THRESH = {
  // camera tolerance
  minKPScore: 0.2,

  // UI
  cueHoldMs: 600,

  // --- SQUAT (relative-only) ---
  repDownFrac: 0.06,
  repTopFrac: 0.06,
  minRepMs: 500,
  squatTorsoChangeMax: 50,

  // --- Global posture hints (kept simple)
  lineDevMax: 18,
  neckMax: 30,

  // --- PLANK (side-view gating) ---
  plankLineDevMax: 28,
  plankNeckMax: 45,
  plankHorizontalMaxDeg: 40,
  plankMinShoulderAnkleDxPx: 60,
  supportUnderShoulderPx: 150, // wrist/elbow roughly under shoulder (x distance)

  // --- PUSH-UP (same idea as plank; tuned a bit stricter) ---
  // --- PUSH-UP (more forgiving) ---
   pushupLineDevMax: 30,            // was 22
   pushupNeckMax: 45,               // was 35
   pushupHorizontalMaxDeg: 38,      // was 25
   pushupSupportUnderShoulderPx: 110, // was 110


      // --- wallsit / deadbug (permissive)
  wallsitShinTiltMax: 22,
  wallsitBackTiltMax: 22,
  deadbugBackContactMaxPx: 80,
  deadbugLimbSpeedMaxPx: 60,
} as const;
