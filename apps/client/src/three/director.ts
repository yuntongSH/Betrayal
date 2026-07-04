/**
 * Cinematic hooks the beat layer (src/state/beats.ts) drives when a card draw,
 * discovery, death or haunt happens. Plain module singletons: CameraDirector
 * reads `director` per-frame, BeatFX drains `pendingFx` per-frame.
 */

/** While `performance.now() < until`, the camera eases toward `focusKey`'s room
 *  and dollies in for the reveal; expiry eases back naturally. */
export const director = {
  focusKey: null as string | null,
  until: 0,
};

export function focusPulse(roomKey: string, ms = 1600): void {
  director.focusKey = roomKey;
  director.until = performance.now() + ms;
}

export type FxKind = "item" | "event" | "omen" | "death" | "haunt" | "discovery";

export interface FxRequest {
  roomKey: string;
  type: FxKind;
}

/** In-room 3D accompaniment requests (light pulse + ember burst), drained by
 *  BeatFX inside its useFrame. */
export const pendingFx: FxRequest[] = [];

export function spawnBeatFx(roomKey: string, type: FxKind): void {
  pendingFx.push({ roomKey, type });
}

export const FX_COLORS: Record<FxKind, number> = {
  item: 0xe2a85a,
  event: 0x8f6fd8,
  omen: 0xc2412f,
  death: 0x7a1010,
  haunt: 0xa01818,
  discovery: 0xd8c090,
};
