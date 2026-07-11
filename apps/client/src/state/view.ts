/**
 * Camera view mode — the classic bird's-eye board view, or first-person
 * through your explorer's eyes ("V" / the HUD eye button). Immersion knobs
 * hang off this: FirstPersonRig drives the camera, CameraDirector and the
 * x-ray walls stand down, your own body hides, and the arrow keys become
 * camera-relative. Persisted per browser.
 */
import { create } from "zustand";

export type ViewMode = "overview" | "first";

function initialMode(): ViewMode {
  try {
    return localStorage.getItem("dh:view") === "first" ? "first" : "overview";
  } catch {
    return "overview";
  }
}

export const useView = create<{ mode: ViewMode }>(() => ({ mode: initialMode() }));

export function toggleView(): void {
  const mode: ViewMode = useView.getState().mode === "first" ? "overview" : "first";
  useView.setState({ mode });
  try {
    localStorage.setItem("dh:view", mode);
  } catch {
    /* private browsing */
  }
}
