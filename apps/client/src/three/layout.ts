import { RING } from "@dread-hollow/decor";
import type { Floor, GameState, PlacedRoom } from "@dread-hollow/shared";

/** World-space sizing of the manor. Grid (x, y) maps to world (x, z); each
 *  floor is lifted to its own height so the house reads as a stacked dollhouse. */
export const TILE = 7;
export const WALL_H = 3.2;
export const FLOOR_GAP = 11;

export const FLOOR_Y: Record<Floor, number> = {
  basement: -FLOOR_GAP,
  ground: 0,
  upper: FLOOR_GAP,
};

export function roomWorld(r: PlacedRoom): [number, number, number] {
  return [r.x * TILE, FLOOR_Y[r.floor], r.y * TILE];
}

/** Tokens stand and travel on the mid-line of the walkable annulus that decor
 *  keeps clear between the centerpiece island and the wall furniture. */
export const WALK_RING_R = (RING[0] + RING[1]) / 2; // 1.6

/** Spread N tokens sharing a room around a small ring so none overlap.
 *  A lone occupant stands ON the ring too — due +z (south), in front of the
 *  centerpiece from the default camera — never on the furniture at center. */
export function ringOffset(i: number, count: number, radius = WALK_RING_R): [number, number] {
  if (count <= 1) return [0, radius];
  const a = (i / count) * Math.PI * 2;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

export interface Occupant {
  kind: "player" | "monster";
  id: string;
}

/** Stable ordering of everyone standing (or fallen) in a given room key. */
export function occupantsAt(game: GameState, key: string): Occupant[] {
  const out: Occupant[] = [];
  for (const p of game.players) {
    // The dead stay where the house took them — a body in the room.
    if (p.position === key) out.push({ kind: "player", id: p.id });
  }
  for (const m of game.haunt?.monsters ?? []) {
    if (m.position === key && m.hp > 0) out.push({ kind: "monster", id: m.id });
  }
  return out;
}
