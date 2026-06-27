import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { DIRECTIONS, legalMoves, neighborKey, type Direction } from "@dread-hollow/shared";
import { useStore } from "../state/store";

/** Grid axes in world space (north = −z, east = +x). */
const AXIS: Record<Direction, THREE.Vector3> = {
  north: new THREE.Vector3(0, 0, -1),
  south: new THREE.Vector3(0, 0, 1),
  east: new THREE.Vector3(1, 0, 0),
  west: new THREE.Vector3(-1, 0, 0),
};

/** Snap an arbitrary ground vector to the nearest compass direction. */
function snap(v: THREE.Vector3): Direction {
  let best: Direction = "north";
  let bestDot = -Infinity;
  for (const d of DIRECTIONS) {
    const dot = v.dot(AXIS[d]);
    if (dot > bestDot) { bestDot = dot; best = d; }
  }
  return best;
}

const ARROW: Record<string, "up" | "down" | "left" | "right"> = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};

/**
 * Keyboard movement, lives inside the Canvas so it can read the live camera.
 * Arrows/WASD are interpreted **relative to the camera** — "up" always means
 * "away from you" no matter how the house is orbited — then snapped to the grid
 * direction the player actually walks. E ends the turn. When a press can't do
 * anything we flash a one-line reason instead of silently ignoring it.
 */
export function KeyboardMover() {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.Camera;
    controls: { target?: THREE.Vector3 } | null;
  };
  const game = useStore((s) => s.game);
  const myId = useStore((s) => s.playerId);
  const moveTo = useStore((s) => s.moveTo);
  const explore = useStore((s) => s.explore);
  const endTurn = useStore((s) => s.endTurn);
  const setNotice = useStore((s) => s.setNotice);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!game || !myId) return;
      if (e.key === "e" || e.key === "E") {
        if (game.activePlayerId === myId && game.phase !== "ended") endTurn();
        return;
      }
      const which = ARROW[e.key];
      if (!which) return;
      if (game.phase === "ended") return;
      if (game.activePlayerId !== myId) {
        setNotice("Hold on — it isn't your turn yet.");
        return;
      }
      const me = game.players.find((p) => p.id === myId);
      const room = me?.position ? game.house[me.position] : undefined;
      if (!room) return;

      // Build a camera-relative basis on the ground plane.
      const fwd = new THREE.Vector3();
      const target = controls?.target ?? new THREE.Vector3();
      fwd.subVectors(target, camera.position);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const v =
        which === "up" ? fwd
        : which === "down" ? fwd.clone().negate()
        : which === "right" ? right
        : right.clone().negate();
      const dir = snap(v);

      const legal = legalMoves(game, myId);
      if (legal.doors.includes(dir)) {
        e.preventDefault();
        explore(dir);
        return;
      }
      const nKey = neighborKey(room.floor, room.x, room.y, dir);
      if (legal.explored.includes(nKey)) {
        e.preventDefault();
        moveTo(nKey);
        return;
      }
      e.preventDefault();
      setNotice(game.movementLeft <= 0 ? "No movement left — press E to end your turn." : "No way through there.");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, myId, moveTo, explore, endTurn, setNotice, camera, controls]);

  return null;
}
