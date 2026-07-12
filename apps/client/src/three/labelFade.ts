/**
 * Proximity fade for 3D-anchored HTML labels (name tags, door plaques).
 *
 * drei's <Html distanceFactor> keeps a label's apparent size steady at a
 * distance — which means the scale explodes as the camera closes in. In
 * first person you can stand nose-to-nose with another explorer, and their
 * name tag becomes a screen-filling banner. The fix is fiction-friendly:
 * when you're close enough to SEE someone, you don't need their name tag —
 * fade it out entirely inside `near`, back to full by `full`.
 *
 * Call from a useFrame with the label's WORLD position; writes style
 * directly on the wrapped element (no React re-render per frame).
 */
import * as THREE from "three";

const P = new THREE.Vector3();

export function fadeLabelByDistance(
  el: HTMLElement | null,
  camera: THREE.Camera,
  x: number,
  y: number,
  z: number,
  near = 1.6,
  full = 2.8,
): void {
  if (!el) return;
  const d = camera.position.distanceTo(P.set(x, y, z));
  const o = THREE.MathUtils.clamp((d - near) / (full - near), 0, 1);
  el.style.opacity = o.toFixed(2);
  el.style.visibility = o < 0.02 ? "hidden" : "visible";
}
