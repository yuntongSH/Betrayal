import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { crazy } from "./net/crazygames";
import "./styles.css";

// Portal telemetry (no-op off CrazyGames): loading has begun.
crazy.boot();

// Label reaper: no 3D-anchored tag may EVER render as a banner. The scale
// math is fixed at the source (constant size in first person, proximity
// fades, mode-aware bands) — but drei's Html wrappers can be orphaned by a
// remount race, and an orphan keeps its last transform forever: a frozen
// giant "name (bot)" no component update can reach. Anything taller than
// 64px (legit tags top out around 30px) is culled on sight.
setInterval(() => {
  for (const el of document.querySelectorAll<HTMLElement>(".token-label, .room-label")) {
    if (el.getBoundingClientRect().height > 64) el.style.display = "none";
  }
}, 1500);

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
