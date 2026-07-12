import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { crazy } from "./net/crazygames";
import "./styles.css";

// Portal telemetry (no-op off CrazyGames): loading has begun.
crazy.boot();

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
