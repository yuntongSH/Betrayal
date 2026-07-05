import { useEffect } from "react";
import { legalMoves, neighborKey, parseKey, type Direction } from "@dread-hollow/shared";
import { useStore } from "../state/store";

const ARROW: Record<string, "up" | "down" | "left" | "right"> = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};

/**
 * Keyboard movement. Arrows/WASD are MAP-ABSOLUTE — ↑ is always north on the
 * minimap, ← always west — so the keys agree with the bird's-eye map no matter
 * how the camera orbits or which way the hero stands. (Hero-relative keys were
 * tried and inverted against the map whenever the hero faced south.) E ends
 * the turn. When a press can't do anything we flash a one-line reason instead
 * of silently ignoring it.
 */
const KEY_DIR: Record<"up" | "down" | "left" | "right", Direction> = {
  up: "north",
  down: "south",
  left: "west",
  right: "east",
};
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

      // Map-absolute: the key IS the compass direction, same as the minimap.
      const dir = KEY_DIR[which];

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
