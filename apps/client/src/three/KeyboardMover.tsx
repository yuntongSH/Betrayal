import { useEffect } from "react";
import * as THREE from "three";
import { DIRECTIONS, legalMoves, neighborKey, parseKey, type Direction } from "@dread-hollow/shared";
import { useStore } from "../state/store";
import { followTarget } from "./followCam";

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

/** Compass turns relative to a facing (the hero's left is facing rotated +90°). */
const LEFT_OF: Record<Direction, Direction> = { north: "west", west: "south", south: "east", east: "north" };
const RIGHT_OF: Record<Direction, Direction> = { north: "east", east: "south", south: "west", west: "north" };
const BACK_OF: Record<Direction, Direction> = { north: "south", south: "north", east: "west", west: "east" };

const ARROW: Record<string, "up" | "down" | "left" | "right"> = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};

// Scratch — the hero's facing on the ground plane, rebuilt per keypress.
const FACING = new THREE.Vector3();

/**
 * Keyboard movement. Arrows/WASD are interpreted **relative to the hero** —
 * "up" continues the way he is walking/standing, "left" is *his* left — by
 * reading the token group's live yaw (broadcast via followTarget by the active
 * token; yaw = atan2(dx, dz), so facing = (sin yaw, 0, cos yaw)) and snapping
 * it to the nearest grid direction. Since the walker always turns to face his
 * travel direction, controls stay consistent hop after hop. E ends the turn.
 * When a press can't do anything we flash a one-line reason instead of
 * silently ignoring it.
 */
export function KeyboardMover() {
  const game = useStore((s) => s.game);
  const myId = useStore((s) => s.playerId);
  const moveTo = useStore((s) => s.moveTo);
  const explore = useStore((s) => s.explore);
  const endTurn = useStore((s) => s.endTurn);
  const setNotice = useStore((s) => s.setNotice);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!game || !myId) return;
      // A full-screen overlay (haunt reveal / help / beat card) is open — don't
      // let arrows or E act on the board hidden behind it.
      if (document.querySelector(".haunt-reveal, .help-overlay, .card-reveal")) return;
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

      // The hero's facing, snapped to the grid: forward is where he looks.
      FACING.set(Math.sin(followTarget.yaw), 0, Math.cos(followTarget.yaw));
      const facing = snap(FACING);
      const dir =
        which === "up" ? facing
        : which === "down" ? BACK_OF[facing]
        : which === "left" ? LEFT_OF[facing]
        : RIGHT_OF[facing];

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
      // Vertical fallback: stairs and the elevator have no compass direction, so
      // "up"/"down" also ascend/descend to a reachable landing on another floor
      // when no same-floor move applies.
      if (which === "up" || which === "down") {
        const RANK: Record<string, number> = { basement: 0, ground: 1, upper: 2 };
        const here = RANK[room.floor];
        const cross = legal.explored
          .map((k) => ({ k, r: RANK[parseKey(k).floor] }))
          .filter((o) => (which === "up" ? o.r > here : o.r < here))
          .sort((p, q) => (which === "up" ? p.r - q.r : q.r - p.r));
        if (cross.length) {
          e.preventDefault();
          moveTo(cross[0]!.k);
          return;
        }
      }
      e.preventDefault();
      setNotice(game.movementLeft <= 0 ? "No movement left — press E to end your turn." : "No way through there.");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, myId, moveTo, explore, endTurn, setNotice]);

  return null;
}
