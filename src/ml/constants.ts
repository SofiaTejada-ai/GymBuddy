export const THRESH = {
  holdSecondGreenFrac: 0.60,

  lineDevMax: 10,
  neckMax: 20,

  repDownFrac: 0.06,
  repTopFrac: 0.03,

  squatDepthMin: 150,
  squatDepthMax: 175,
  squatTorsoChangeMax: 30,
  kneeCaveFrac: 0.25,

  pushupDepthElbowMax: 110,

  deadbugBackContactMaxPx: 55,
  deadbugLimbSpeedMaxPx: 14,

  wallsitShinTiltMax: 14,
  wallsitBackTiltMax: 14,

  // new knobs
  minKPScore: 0.40,       // ignore keypoints below this
  cueHoldMs: 800,         // keep a tip on screen at least this long
};
