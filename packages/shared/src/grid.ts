import type { Direction, Floor, Rotation } from "./types";
import { DIRECTIONS } from "./types";

/** Unit step for each compass direction on a floor's 2D grid. */
export const DIR_DELTA: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

export function opposite(d: Direction): Direction {
  switch (d) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    case "west":
      return "east";
  }
}

/** Rotate a local door direction by a tile rotation (clockwise degrees). */
export function rotateDirection(d: Direction, rotation: Rotation): Direction {
  const steps = (rotation / 90) % 4;
  const idx = DIRECTIONS.indexOf(d);
  return DIRECTIONS[(idx + steps) % 4]!;
}

/** The set of world-space doorways for a tile placed at a given rotation. */
export function worldDoorways(
  doorways: readonly Direction[],
  rotation: Rotation,
): Set<Direction> {
  return new Set(doorways.map((d) => rotateDirection(d, rotation)));
}

export function key(floor: Floor, x: number, y: number): string {
  return `${floor}:${x}:${y}`;
}

export function parseKey(k: string): { floor: Floor; x: number; y: number } {
  const [floor, x, y] = k.split(":");
  return { floor: floor as Floor, x: Number(x), y: Number(y) };
}

export function neighborKey(
  floor: Floor,
  x: number,
  y: number,
  dir: Direction,
): string {
  const { dx, dy } = DIR_DELTA[dir];
  return key(floor, x + dx, y + dy);
}

export const ALL_ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
