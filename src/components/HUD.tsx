import React from "react";
import type { DebugHUD } from "../ml/logic";

export default function HUD({ d }: { d: DebugHUD }) {
  return (
    <div className="fixed top-2 left-2 z-50 rounded-xl bg-black/60 text-white px-3 py-2 font-mono text-xs leading-5">
      <div>{d.mode} | kp {d.kp.toFixed(2)} | phase: {d.phase}</div>
      <div>knee {d.kneeDeg}° | torsoΔ {d.torsoDelta}° | hipDrop {d.hipDrop}</div>
      <div>feet:{d.feet}</div>
    </div>
  );
}
