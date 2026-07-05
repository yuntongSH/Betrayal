/**
 * Waypoint walking — tokens travel the walkable annulus decor keeps clear
 * around each room's centerpiece island instead of gliding straight through
 * the furniture. HouseView builds a path when a token's assigned slot changes;
 * PlayerToken/MonsterToken consume it at walk speed under a distance-based
 * accelerate/settle envelope, so bodies have weight instead of constant glide.
 */
import * as THREE from "three";
import { ISLAND_R } from "@dread-hollow/decor";
import { parseKey } from "@dread-hollow/shared";
import { FLOOR_Y, TILE, WALK_RING_R } from "./layout";

export type WalkPoint = [number, number, number];

/** Peak stride speed (u/s), tuned to the Walk clip cadence at TILE = 7. */
export const WALK_SPEED = 2.7;

/** Speed envelope, distance-based so frame rate cannot change the shape:
 *  smoothstep up over the first ACCEL_DIST of the path, smoothstep down over
 *  the last SETTLE_DIST, floored so a short hop still covers ground. */
const ACCEL_DIST = 0.45;
const SETTLE_DIST = 0.6;
const ENVELOPE_FLOOR = 0.25;

function smooth01(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

/** Tokens currently covering ground — the same hysteresis flag that drives the
 *  Walk clip, mirrored here (keyed like followCam's trackedTokens) so the
 *  per-frame gaze pass can find walkers without touching React state. */
export const walkingTokens = new Set<string>();

export function setWalking(id: string, on: boolean): void {
  if (on) walkingTokens.add(id);
  else walkingTokens.delete(id);
}

/** Max arc chord: a 60° chord of the r=1.6 ring stays cos(30°)·1.6 ≈ 1.39 from
 *  center — outside ISLAND_R, so ring travel never clips the centerpiece. */
const ARC_STEP = Math.PI / 3;

/** Shortest signed sweep from angle `a` to angle `b`. */
function sweep(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Ring waypoints (both endpoints excluded) from `fromA` to `toA` around
 *  (cx, cz), going the short way, split so no chord exceeds 60°. */
function pushArc(out: WalkPoint[], cx: number, y: number, cz: number, fromA: number, toA: number): void {
  const d = sweep(fromA, toA);
  const n = Math.ceil(Math.abs(d) / ARC_STEP - 1e-4);
  for (let k = 1; k < n; k++) {
    const a = fromA + (d * k) / n;
    out.push([cx + Math.cos(a) * WALK_RING_R, y, cz + Math.sin(a) * WALK_RING_R]);
  }
}

/** Closest distance from (cx, cz) to the segment (ax, az)→(bx, bz). */
function segDistToCenter(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const l2 = abx * abx + abz * abz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * abx + (cz - az) * abz) / l2)) : 0;
  return Math.hypot(ax + abx * t - cx, az + abz * t - cz);
}

/**
 * Waypoints from the token's old slot to its new one, or null where the direct
 * glide stays correct (first placement, floor changes, non-adjacent jumps, and
 * within-room shuffles whose straight line already clears the island).
 */
export function buildWalkPath(fromKey: string, from: WalkPoint, toKey: string, to: WalkPoint): WalkPoint[] | null {
  const a = parseKey(fromKey);
  const b = parseKey(toKey);
  if (a.floor !== b.floor) return null; // stairs/elevator/falls keep today's glide

  const ax = a.x * TILE;
  const az = a.y * TILE;
  const y = FLOOR_Y[a.floor];

  if (fromKey === toKey) {
    // Occupant re-shuffle: straight when the segment clears the island,
    // otherwise around the ring under the same 60° rule.
    if (segDistToCenter(from[0], from[2], to[0], to[2], ax, az) >= ISLAND_R) return null;
    const out: WalkPoint[] = [];
    pushArc(out, ax, y, az, Math.atan2(from[2] - az, from[0] - ax), Math.atan2(to[2] - az, to[0] - ax));
    out.push(to);
    return out;
  }

  // Only orthogonally adjacent rooms share a walkable door corridor.
  if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return null;

  const bx = b.x * TILE;
  const bz = b.y * TILE;
  const dirx = (bx - ax) / TILE;
  const dirz = (bz - az) / TILE;
  const out: WalkPoint[] = [];
  // Around the old room's ring to the door-facing exit point — a straight cut
  // from the far side of the ring would cross the centerpiece.
  pushArc(out, ax, y, az, Math.atan2(from[2] - az, from[0] - ax), Math.atan2(dirz, dirx));
  out.push([ax + dirx * WALK_RING_R, y, az + dirz * WALK_RING_R]); // ring exit
  out.push([(ax + bx) / 2, y, (az + bz) / 2]); // door midpoint
  out.push([bx - dirx * WALK_RING_R, y, bz - dirz * WALK_RING_R]); // ring entry
  pushArc(out, bx, y, bz, Math.atan2(-dirz, -dirx), Math.atan2(to[2] - bz, to[0] - bx));
  out.push(to);
  return out;
}

// Scratch vector shared across tokens — useFrame callbacks run sequentially.
const STEP = new THREE.Vector3();

/** Cursor: the next unreached waypoint plus the ground covered so far, so the
 *  accelerate ramp is distance-based (frame-rate independent) and survives a
 *  waypoint crossing within a single frame. Reset both when the path changes. */
export interface WalkCursor {
  i: number;
  traveled: number;
}

/**
 * Advance `pos` one frame along `path` under an accelerate/settle speed
 * envelope: it ramps up over the first ACCEL_DIST of ground covered and eases
 * down over the last SETTLE_DIST to the end, floored at ENVELOPE_FLOOR so a
 * short hop still moves — bodies gain weight instead of a constant glide.
 * Returns true while the path still owns the motion (the caller falls back to
 * its glide-to-target once the path is spent). Allocation-free.
 */
export function followPath(
  pos: THREE.Vector3,
  path: readonly WalkPoint[],
  cursor: WalkCursor,
  dt: number,
): boolean {
  if (cursor.i >= path.length) return false;

  // Distance still to travel: current position through every remaining waypoint
  // (paths are a handful of points, so this per-frame walk is negligible).
  let distToEnd = 0;
  let px = pos.x, py = pos.y, pz = pos.z;
  for (let k = cursor.i; k < path.length; k++) {
    const w = path[k]!;
    distToEnd += Math.hypot(w[0] - px, w[1] - py, w[2] - pz);
    px = w[0]; py = w[1]; pz = w[2];
  }
  const envelope = Math.max(
    ENVELOPE_FLOOR,
    Math.min(smooth01(cursor.traveled / ACCEL_DIST), smooth01(distToEnd / SETTLE_DIST)),
  );
  let budget = WALK_SPEED * envelope * dt;

  // Spend the frame's travel budget across waypoints (a fast frame may cross
  // more than one), accumulating ground covered for the accelerate ramp.
  while (cursor.i < path.length) {
    const wp = path[cursor.i]!;
    STEP.set(wp[0] - pos.x, wp[1] - pos.y, wp[2] - pos.z);
    const dist = STEP.length();
    if (budget < dist) {
      pos.addScaledVector(STEP, budget / dist);
      cursor.traveled += budget;
      return true;
    }
    pos.set(wp[0], wp[1], wp[2]);
    cursor.traveled += dist;
    budget -= dist;
    cursor.i++;
  }
  return false;
}
