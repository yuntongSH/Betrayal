/**
 * Continuous locomotion for rigged explorers — a 1D blend tree over the
 * Quaternius clips (Idle / Idle_Neutral / Walk / Run) driven by the body's
 * LIVE ground speed instead of a binary walking flag.
 *
 * Two things make the motion read as weight rather than sliding:
 *  - WEIGHTS follow speed continuously, so the accelerate/settle envelope in
 *    walk.ts plays out as idle → stride → idle through the blend, and a jog
 *    passes through the walk cadence on its way up and back down.
 *  - STRIDE RATE is matched to ground speed: the Walk/Run actions'
 *    timeScale is actualSpeed / the speed the cycle was authored for
 *    (WALK_SPEED / RUN_SPEED — the exact constants the path-follower uses),
 *    so feet grip the floor during the ramps instead of skating.
 *
 * The blend never *owns* the whole body: while an override clip (a one-shot
 * reaction or Death) has the stage, the master `hold` envelope is the exact
 * COMPLEMENT of that clip's live effective weight — total mixer weight stays
 * ~1 through both edges of the fade, so the rig never dips toward the bind
 * pose at a death or reaction boundary.
 *
 * Lifecycle: constructing this class only RESOLVES the actions — nothing
 * plays until `own()`, which the owner calls from an effect. StrictMode's
 * dev remount (R3F v9 inherits it into the Canvas) makes drei's useAnimations
 * stop every action in its cleanup; re-running `own()` on the second mount
 * revives them. Playing from a render-phase constructor left them dead.
 *
 * This deliberately goes further than @pmndrs/viverse's movement state (a
 * hard idle/walk/run switch with cross-fades): a board-game token spends
 * most of its travel inside the envelope's ramps, exactly where a discrete
 * switch skates.
 */
import * as THREE from "three";
import { RUN_SPEED, WALK_SPEED } from "./walk";

/** Below this ground speed the body is at rest (matches the glide's tail). */
const REST_EPS = 0.12;
/** 1/s — how fast blend weights chase their targets. */
const BLEND_RATE = 10;

type Slot = "idleA" | "idleB" | "walk" | "run";
const CLIP_FOR: Record<Slot, string> = {
  idleA: "Idle",
  idleB: "Idle_Neutral",
  walk: "Walk",
  run: "Run",
};
const SLOTS = Object.keys(CLIP_FOR) as Slot[];

export class Locomotion {
  private readonly acts: Partial<Record<Slot, THREE.AnimationAction>> = {};
  private readonly w: Record<Slot, number> = { idleA: 1, idleB: 0, walk: 0, run: 0 };

  constructor(actions: Record<string, THREE.AnimationAction | null>) {
    for (const slot of SLOTS) {
      const a = actions[CLIP_FOR[slot]];
      if (a) this.acts[slot] = a;
    }
  }

  /** Take ownership of the four clips: play them at their current weights.
   *  Returns the release that stops them — effect-shaped, so a StrictMode
   *  remount (drei's cleanup stops every action) re-plays them cleanly. */
  own(): () => void {
    for (const slot of SLOTS) {
      const a = this.acts[slot];
      if (!a) continue;
      a.reset().play();
      a.setEffectiveWeight(this.w[slot]);
    }
    return () => {
      for (const slot of SLOTS) this.acts[slot]?.stop();
    };
  }

  /**
   * One frame. `speed` is live planar ground speed (u/s); `restIdle` names
   * which idle owns the standing pose (the idle-variety timer); `override`
   * is whichever clip owns the body instead — a one-shot reaction or Death,
   * playing OR still fading out. The blend weights complement its live
   * weight exactly.
   */
  update(
    dt: number,
    speed: number,
    restIdle: "Idle" | "Idle_Neutral",
    override: THREE.AnimationAction | null,
  ): void {
    const hold = 1 - THREE.MathUtils.clamp(override ? override.getEffectiveWeight() : 0, 0, 1);

    // 1D blend-tree targets: rest → walk over (REST_EPS, WALK_SPEED],
    // walk → run over (WALK_SPEED, RUN_SPEED]. One segment is active at a
    // time, so weights always sum to 1 before the hold envelope.
    const rest: Slot = restIdle === "Idle_Neutral" ? "idleB" : "idleA";
    const t: Record<Slot, number> = { idleA: 0, idleB: 0, walk: 0, run: 0 };
    if (speed <= REST_EPS) {
      t[rest] = 1;
    } else if (speed <= WALK_SPEED) {
      const b = (speed - REST_EPS) / (WALK_SPEED - REST_EPS);
      t.walk = b;
      t[rest] = 1 - b;
    } else {
      const b = Math.min(1, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED));
      t.run = b;
      t.walk = 1 - b;
    }

    const k = 1 - Math.exp(-BLEND_RATE * dt);
    for (const slot of SLOTS) {
      this.w[slot] += (t[slot] - this.w[slot]) * k;
      this.acts[slot]?.setEffectiveWeight(this.w[slot] * hold);
    }

    // Stride-rate matching — feet cover exactly the ground the body does.
    this.acts.walk?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / WALK_SPEED, 0.55, 1.7));
    this.acts.run?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / RUN_SPEED, 0.6, 1.35));
  }
}
