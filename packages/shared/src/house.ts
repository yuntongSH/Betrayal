/**
 * Spatial queries over the assembled house: which rooms connect, which doorways
 * still open onto the unknown, and shortest-path stepping for monster AI.
 */
import type { Direction, GameState, PlacedRoom } from "./types";
import { key, neighborKey, opposite, parseKey, worldDoorways } from "./grid";
import { ROOMS_BY_ID } from "./content";
import { STAIR_LINKS } from "./setup";

/** World-space doorways of a placed tile (after rotation). */
export function placedDoorways(room: PlacedRoom): Set<Direction> {
  const def = ROOMS_BY_ID[room.roomId];
  return def ? worldDoorways(def.doorways, room.rotation) : new Set<Direction>();
}

/** The central landing tile on each floor. */
const LANDING_HUBS = [key("ground", 0, 0), key("upper", 0, 0), key("basement", 0, 0)];

/** Find the placed Mystic Elevator, if one has been discovered. */
function findElevatorKey(s: GameState): string | null {
  for (const k in s.house) {
    if (ROOMS_BY_ID[s.house[k]!.roomId]?.special === "mystic-elevator") return k;
  }
  return null;
}

/** Keys of rooms reachable in one step — through matching doors, stairs, or the
 *  Mystic Elevator (a vertical hub linking every floor's landing). */
export function connections(s: GameState, fromKey: string): string[] {
  const room = s.house[fromKey];
  if (!room) return [];
  const result: string[] = [];
  for (const dir of placedDoorways(room)) {
    const nKey = neighborKey(room.floor, room.x, room.y, dir);
    const neighbor = s.house[nKey];
    if (neighbor && placedDoorways(neighbor).has(opposite(dir))) {
      result.push(nKey);
    }
  }
  for (const [a, b] of STAIR_LINKS) {
    if (a === fromKey && s.house[b]) result.push(b);
    else if (b === fromKey && s.house[a]) result.push(a);
  }
  // The Mystic Elevator carries you between floors: from the elevator you can
  // ride to any other floor's landing, and from a landing you can call it back.
  if (ROOMS_BY_ID[room.roomId]?.special === "mystic-elevator") {
    for (const hub of LANDING_HUBS) {
      if (s.house[hub] && parseKey(hub).floor !== room.floor) result.push(hub);
    }
  } else if (LANDING_HUBS.includes(fromKey)) {
    const ek = findElevatorKey(s);
    if (ek && parseKey(ek).floor !== room.floor) result.push(ek);
  }
  return [...new Set(result)];
}

/** Open doorways with no tile placed beyond them yet — candidates to explore. */
export function openDoors(s: GameState, fromKey: string): Direction[] {
  const room = s.house[fromKey];
  if (!room) return [];
  const out: Direction[] = [];
  for (const dir of placedDoorways(room)) {
    const nKey = neighborKey(room.floor, room.x, room.y, dir);
    if (!s.house[nKey]) out.push(dir);
  }
  return out;
}

/**
 * Breadth-first search returning the *first step* on a shortest path from
 * `fromKey` toward the nearest key in `targets`, or null if unreachable.
 */
export function stepToward(
  s: GameState,
  fromKey: string,
  targets: ReadonlySet<string>,
): string | null {
  if (targets.has(fromKey)) return fromKey;
  const visited = new Set<string>([fromKey]);
  let frontier: { key: string; first: string | null }[] = [
    { key: fromKey, first: null },
  ];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const nb of connections(s, node.key)) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        const first = node.first ?? nb;
        if (targets.has(nb)) return first;
        next.push({ key: nb, first });
      }
    }
    frontier = next;
  }
  return null;
}
