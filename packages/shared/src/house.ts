/**
 * Spatial queries over the assembled house: which rooms connect, which doorways
 * still open onto the unknown, and shortest-path stepping for monster AI.
 */
import type { Direction, GameState, PlacedRoom } from "./types";
import { neighborKey, opposite, worldDoorways } from "./grid";
import { ROOMS_BY_ID } from "./content";
import { STAIR_LINKS } from "./setup";

/** World-space doorways of a placed tile (after rotation). */
export function placedDoorways(room: PlacedRoom): Set<Direction> {
  const def = ROOMS_BY_ID[room.roomId];
  return def ? worldDoorways(def.doorways, room.rotation) : new Set<Direction>();
}

/** Keys of rooms reachable in one step — through matching doors or stairs. */
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
  return result;
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
