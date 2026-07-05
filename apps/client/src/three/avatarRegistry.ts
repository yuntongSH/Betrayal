import type { AvatarLife } from "@dread-hollow/decor";

/**
 * A rigged explorer's imperative controls, published by <Avatar> under the
 * player's token id and consumed from outside the r3f tree (PlayerToken's gaze
 * pass, store actions, reaction triggers) — the same module-registry pattern as
 * followCam's trackedTokens, so per-frame reads never touch React state.
 */
export interface AvatarHandle {
  /** The additive life layer — its `setGaze` aims the head at a world point. */
  life: AvatarLife;
  /** Play a one-shot body reaction over the current base clip (see refine.ts
   *  REACTION_CLIPS). Skips the dead; hit/stagger may interrupt a softer beat. */
  playOneShot: (kind: OneShotKind) => void;
}

export type OneShotKind = "hit" | "stagger" | "interact" | "attack" | "cheer";

export const avatarHandles = new Map<string, AvatarHandle>();

/** Fire a reaction on one explorer, optionally after a stagger delay so a whole
 *  party doesn't flinch on the exact same frame. No-op if that token has no
 *  rigged avatar (procedural fallback) or has unmounted before the delay ends. */
export function playOneShotFor(id: string, kind: OneShotKind, delayMs = 0): void {
  if (delayMs > 0) {
    setTimeout(() => avatarHandles.get(id)?.playOneShot(kind), delayMs);
  } else {
    avatarHandles.get(id)?.playOneShot(kind);
  }
}
