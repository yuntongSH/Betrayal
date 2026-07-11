import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { useBeats } from "../state/beats";
import { firstPerson } from "./director";
import { roomWorld } from "./layout";
import { trackedTokens, xrayWalls, MAX_FRAME_DT, type XrayData } from "./followCam";

const XRAY_OPACITY = 0.12;
const XRAY_HOLD_MS = 250; // absorbs single-frame raycast flicker
const XRAY_GHOST_RATE = 10; // s⁻¹ — fade out fast (~0.2 s)
const XRAY_SOLID_RATE = 4; // s⁻¹ — return gently (~0.5 s)
const FACING_DOT = 0.15; // "camera-facing" threshold for the followed room's walls
const RAY_MARGIN = 0.25; // ignore hits within this of the character itself

// Reused scratch — no per-frame allocations.
const ray = new THREE.Ray();
const dir = new THREE.Vector3();
const chest = new THREE.Vector3();
const hit = new THREE.Vector3();
const camDir = new THREE.Vector3();

/**
 * X-ray walls: any wall mesh between the camera and a living character fades to
 * ghost opacity so the figure is never hidden, and the followed room's
 * camera-facing walls stay ghosted even at rest. Room-perimeter walls,
 * wall-height decor trim (cornice/beams/pilasters, tagged `xrayTrim`) and the
 * WHOLE doorway assembly (stubs, header, jambs, swinging leaf) are registered —
 * only furniture never fades. A zero normal skips pass B's facing test: trim
 * ghosts with its whole room, and doors carry BOTH adjacent room keys so the
 * followed room's boundary reads open door-and-all from any orbit angle
 * (players kept reporting "the door is blocking the view" when only the walls
 * ghosted). This is the ONLY code that touches wall
 * opacity/transparent/depthWrite (fog-of-war owns color, they compose).
 */
export function XrayWalls() {
  useFrame(({ camera }, rawDt) => {
    // Modal beat up: hold every wall at its current opacity (no fade lerps).
    if (useBeats.getState().worldFrozen) return;
    const dt = Math.min(MAX_FRAME_DT, rawDt);
    const now = performance.now();

    // First-person: walls stay walls — seeing figures through masonry breaks
    // the dread (and hands out information the eyes shouldn't have). Passes
    // A/B stop marking, pass C below keeps running so ghosts fade back solid.
    if (firstPerson.driving) {
      applyFades(dt, now);
      return;
    }

    // A. raycast camera -> every living character's chest; occluders go ghost.
    for (const { obj, chestY } of trackedTokens.values()) {
      chest.copy(obj.position);
      chest.y += chestY;
      dir.copy(chest).sub(camera.position);
      const len = dir.length();
      if (len < 1e-4) continue;
      dir.normalize();
      ray.origin.copy(camera.position);
      ray.direction.copy(dir);
      for (const w of xrayWalls) {
        const x = w.userData.xray as XrayData;
        if (ray.intersectBox(x.box, hit) && hit.distanceTo(camera.position) < len - RAY_MARGIN) {
          x.until = now + XRAY_HOLD_MS;
        }
      }
    }

    // B. the followed room: its camera-facing walls ghost unconditionally so
    //    the active explorer's room always reads open from any orbit angle.
    const game = useStore.getState().game;
    const active = game?.players.find((p) => p.id === game.activePlayerId);
    const room = active?.position ? game?.house[active.position] : undefined;
    if (room) {
      const [rx, , rz] = roomWorld(room);
      camDir.set(camera.position.x - rx, 0, camera.position.z - rz).normalize();
      for (const w of xrayWalls) {
        const x = w.userData.xray as XrayData;
        if (
          x.roomKeys.includes(room.key) &&
          (x.normal.lengthSq() === 0 || x.normal.dot(camDir) > FACING_DOT)
        ) {
          x.until = now + XRAY_HOLD_MS;
        }
      }
    }

    // C. apply the fades.
    applyFades(dt, now);
  });

  return null;
}

/** Pass C — smooth per-material opacity, opaque pass when solid (no z-sorting
 *  shimmer), shadows keep casting so light pools are stable. Runs even while
 *  first-person suppresses the marking passes, so ghosts fade back solid. */
function applyFades(dt: number, now: number): void {
  for (const w of xrayWalls) {
    const m = w.material as THREE.MeshStandardMaterial;
    const ghost = now < (w.userData.xray as XrayData).until;
    const target = ghost ? XRAY_OPACITY : 1;
    m.opacity +=
      (target - m.opacity) *
      (1 - Math.exp(-(target < m.opacity ? XRAY_GHOST_RATE : XRAY_SOLID_RATE) * dt));
    const solid = m.opacity > 0.985;
    m.transparent = !solid;
    m.depthWrite = solid;
    if (solid) m.opacity = 1;
  }
}
