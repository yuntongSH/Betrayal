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
 * The blend never *owns* the whole body: a master `hold` envelope ducks all
 * four actions while a one-shot reaction or the Death clip has the stage
 * (down fast, back gently), replacing the old fadeIn/fadeOut juggling.
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
/** 1/s — the hold envelope: duck fast when a reaction/Death takes the body… */
const HOLD_IN_RATE = 14;
/** …and hand it back gently. */
const HOLD_OUT_RATE = 5;

type Slot = "idleA" | "idleB" | "walk" | "run";
const CLIP_FOR: Record<Slot, string> = {
  idleA: "Idle",
  idleB: "Idle_Neutral",
  walk: "Walk",
  run: "Run",
};

export class Locomotion {
  private readonly acts: Partial<Record<Slot, THREE.AnimationAction>> = {};
  private readonly w: Record<Slot, number> = { idleA: 1, idleB: 0, walk: 0, run: 0 };
  private hold = 1;

  constructor(actions: Record<string, THREE.AnimationAction | null>) {
    for (const slot of Object.keys(CLIP_FOR) as Slot[]) {
      const a = actions[CLIP_FOR[slot]];
      if (!a) continue;
      this.acts[slot] = a;
      // All four run forever; this class owns their weights exclusively.
      a.reset().play();
      a.setEffectiveWeight(this.w[slot]);
    }
  }

  /**
   * One frame. `speed` is live planar ground speed (u/s); `restIdle` names
   * which idle owns the standing pose (the idle-variety timer); `held` is
   * true while a one-shot reaction or Death should have the body to itself.
   */
  update(dt: number, speed: number, restIdle: "Idle" | "Idle_Neutral", held: boolean): void {
    const holdTarget = held ? 0 : 1;
    const rate = holdTarget < this.hold ? HOLD_IN_RATE : HOLD_OUT_RATE;
    this.hold += (holdTarget - this.hold) * (1 - Math.exp(-rate * dt));

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
    for (const slot of Object.keys(CLIP_FOR) as Slot[]) {
      this.w[slot] += (t[slot] - this.w[slot]) * k;
      this.acts[slot]?.setEffectiveWeight(this.w[slot] * this.hold);
    }

    // Stride-rate matching — feet cover exactly the ground the body does.
    this.acts.walk?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / WALK_SPEED, 0.55, 1.7));
    this.acts.run?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / RUN_SPEED, 0.6, 1.35));
  }
}
