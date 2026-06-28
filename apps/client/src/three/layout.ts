import type { Floor, GameState, PlacedRoom } from "@dread-hollow/shared";

/** World-space sizing of the manor. Grid (x, y) maps to world (x, z); each
 *  floor is lifted to its own height so the house reads as a stacked dollhouse. */
export const TILE = 4;
export const WALL_H = 2.7;
export const FLOOR_GAP = 7;

export const FLOOR_Y: Record<Floor, number> = {
  basement: -FLOOR_GAP,
  ground: 0,
  upper: FLOOR_GAP,
};

export function roomWorld(r: PlacedRoom): [number, number, number] {
  return [r.x * TILE, FLOOR_Y[r.floor], r.y * TILE];
}

/** Spread N tokens sharing a room around a small ring so none overlap. */
export function ringOffset(i: number, count: number, radius = 1): [number, number] {
  if (count <= 1) return [0, 0];
  const a = (i / count) * Math.PI * 2;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

export interface Occupant {
  kind: "player" | "monster";
  id: string;
}

/** Stable ordering of everyone standing in a given room key. */
export function occupantsAt(game: GameState, key: string): Occupant[] {
  const out: Occupant[] = [];
  for (const p of game.players) {
    if (p.position === key && p.alive) out.push({ kind: "player", id: p.id });
  }
  for (const m of game.haunt?.monsters ?? []) {
    if (m.position === key && m.hp > 0) out.push({ kind: "monster", id: m.id });
  }
  return out;
}
