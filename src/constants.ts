export const THRESH = {
  // camera tolerance
  minKPScore: 0.2,

  // UI
  cueHoldMs: 600,

  // --- SQUAT (relative-only) ---
  repDownFrac: 0.06,   // ≥6% drop from your standing baseline = “in squat”
  repTopFrac: 0.06,    // within 6% of baseline = “at top”
  minRepMs: 500,       // debounce reps
  squatTorsoChangeMax: 50,

  // --- Global posture hints (kept simple)
  lineDevMax: 18,
  neckMax: 30,

  // --- PLANK (side-view gating) ---
   plankLineDevMax: 28,
  plankNeckMax: 45,
  plankHorizontalMaxDeg: 40,
  plankMinShoulderAnkleDxPx: 60,
  supportUnderShoulderPx: 150,       // wrist/elbow roughly under shoulder (x distance)

  // --- wallsit / deadbug (permissive)
  wallsitShinTiltMax: 22,
  wallsitBackTiltMax: 22,
  deadbugBackContactMaxPx: 80,
  deadbugLimbSpeedMaxPx: 60,
} as const;
