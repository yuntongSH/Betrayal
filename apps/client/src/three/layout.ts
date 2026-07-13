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

/** A stable 0..1 hash from a string (room key) — same idea as the decor
 *  seeds, so a room's idle spot is deterministic across renders. */
function keyHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Spread N tokens sharing a room around a small ring so none overlap, always
 *  on the walkable annulus decor keeps clear (never on the centre furniture).
 *
 *  A LONE occupant no longer plants at the same due-south mark in every room —
 *  that made every room read as having the same mannequin staked to the floor,
 *  often right against the new centrepieces. Seeded by the room key, they stand
 *  at a believable clock position on the ring instead, so a house full of solo
 *  bots looks like people who wandered to different spots. Multi-occupant rings
 *  keep their even spacing (with the same per-room phase so pairs don't always
 *  straddle the same axis). */
export function ringOffset(
  i: number,
  count: number,
  radius = WALK_RING_R,
  roomKey = "",
): [number, number] {
  const phase = roomKey ? keyHash(roomKey) * Math.PI * 2 : Math.PI / 2;
  if (count <= 1) {
    // vary the radius a touch too (0.85–1.05× ring) so they don't all sit on
    // one perfect circle when you see several rooms at once
    const r = radius * (0.85 + keyHash(roomKey + "r") * 0.2);
    return [Math.cos(phase) * r, Math.sin(phase) * r];
  }
  const a = phase + (i / count) * Math.PI * 2;
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
