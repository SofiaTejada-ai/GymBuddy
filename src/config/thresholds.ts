// Centralized thresholds + demo/live toggles

export const THRESH = {
  // detector & UX
  minKPScore: 0.55,
  cueHoldMs: 400,
  holdSecondGreenFrac: 0.7,

  // gating (frames @ ~30fps)
  goodFramesToGreen: 16,   // ~0.53s
  badFramesToRed: 10,      // ~0.33s

  // squat
  squatDepthMin: 85,       // deg at bottom
  squatDepthMax: 120,      // deg at bottom (camera low tolerance)
  repDownFrac: 0.12,       // ↓ travel ≥ 12% of personal span to start descend
  repTopFrac: 0.10,        // within 10% of top = "at top"
  kneeCaveFrac: 0.12,      // valgus allowance (fraction hip–ankle width)
  squatTorsoChangeMax: 30, // deg change allowed vs top

  // adaptive easing for low confidence (live only)
  minConfClamp: 0.50,      // conf ∈ [0.5,1]
  easeCenter: 0.75,        // < this → ease thresholds
};

export type Exercise = "squat" | "pushup" | "plank" | "deadbug" | "wallsit";
