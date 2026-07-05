import * as THREE from "three";

/**
 * Frame-rate glue between the token layer and the camera/x-ray systems, kept as
 * plain mutable singletons so per-frame reads never touch React state.
 */

/** Frame-delta cap for walk/camera/x-ray consumers. 0.05 made game-time run at
 *  1/3 wall-time below 20 FPS — walking turned glacial exactly when the scene
 *  was heaviest. 0.12 keeps real-time pacing down to ~8 FPS while still capping
 *  tab-switch/GC hitches (followPath is distance-based and snaps to a waypoint
 *  rather than overshooting, so the larger step cannot oscillate). */
export const MAX_FRAME_DT = 0.12;

/** Written every frame by the ACTIVE player's token; consumed by CameraDirector.
 *  `valid` is cleared after each consume, so a dead/absent active token
 *  degrades gracefully to plain room-follow. */
export const followTarget = {
  pos: new THREE.Vector3(),
  yaw: 0,
  moving: false,
  valid: false,
};

/** Live token groups (players alive + monsters), so the x-ray raycast can aim
 *  at the lerped mid-walk position rather than the game-state destination. */
export interface TrackedToken {
  obj: THREE.Object3D;
  chestY: number;
}
export const trackedTokens = new Map<string, TrackedToken>();

export function registerToken(id: string, obj: THREE.Object3D, chestY: number): void {
  trackedTokens.set(id, { obj, chestY });
}

export function unregisterToken(id: string): void {
  trackedTokens.delete(id);
}

/** Per-wall x-ray bookkeeping, attached to each fadeable mesh as userData.xray. */
export interface XrayData {
  until: number; // ghost while performance.now() < until
  roomKey: string; // "" for door pieces — never matches the followed room
  normal: THREE.Vector3; // unit outward normal (zero for door pieces)
  box: THREE.Box3; // world-space bounds, precomputed once (walls are static)
}

/** Flat registry of every fadeable mesh: room-perimeter walls plus door
 *  stubs/headers. Jambs, door leaves and decor are never registered, so rays
 *  pass through them without effect. */
export const xrayWalls = new Set<THREE.Mesh>();

export function registerWall(mesh: THREE.Mesh): void {
  xrayWalls.add(mesh);
}

export function unregisterWall(mesh: THREE.Mesh): void {
  xrayWalls.delete(mesh);
}
