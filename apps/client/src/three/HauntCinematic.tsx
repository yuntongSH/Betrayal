/**
 * The haunt reveal, staged — a @pmndrs/timeline choreography that plays the
 * moment the modal queue drains after the house turns (exactly when the DOM
 * banner used to pop):
 *
 *   1. seize the stage (CameraDirector + ambient gaze stand down, orbit input
 *      pauses) and push the camera in low on the traitor along the current
 *      view axis — always visually continuous, whatever the orbit was;
 *   2. half a beat in, the traitor's head turns and stares INTO the lens
 *      (the avatar life layer's gaze, aimed at the shot position);
 *   3. the dread radiates — the other explorers stagger in distance order
 *      from the traitor, nearest flinching first;
 *   4. the banner drops over the held close-up, the shot lingers while it's
 *      read, then the director eases back to its usual framing.
 *
 * Traitor-less haunts (the house itself rises) frame the haunt's start room
 * and ripple from there. Timing uses SIM-time waits (an action's actionTime
 * accrues from clock.delta), never timePassed() — that's wall-clock setTimeout
 * under the hood, and a world-freeze mid-cinematic must pause the whole
 * choreography together, not desync it. runTimeline is pull-based: we tick it
 * from useFrame, so the governor and the freeze see it like every other
 * dt-driven system. NOTE an init-only action never completes (nothing aborts
 * its internal signal) — instant side effects ride `update: () => false`.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  action,
  parallel,
  runTimeline,
  scope,
  spring,
  springPresets,
  transition,
  SynchronousAbortController,
} from "@pmndrs/timeline";
import { useStore } from "../state/store";
import { useBeats } from "../state/beats";
import { avatarHandles, playOneShotFor } from "./avatarRegistry";
import { trackedTokens, MAX_FRAME_DT } from "./followCam";
import { cinematic } from "./director";
import { markActive } from "./governor";
import { roomWorld } from "./layout";

/** Camera framing for the traitor close-up. */
const SHOT_DIST = 5.4;
const SHOT_RISE = 2.3; // camera height above the traitor's feet
const LOOK_Y = 1.25; // stare line — the traitor's chest/face

/** Sim-time wait: actionTime accumulates clock.delta, so a frozen world
 *  pauses this exactly like the eases. */
const wait = (seconds: number) =>
  action({ update: (_state: unknown, _clock, t) => t < seconds });

/** Run a side effect as a one-tick action (init-only actions never finish). */
const fire = (fn: () => void) => action({ init: fn, update: () => false });

interface Shot {
  traitorId: string | null;
  shot: THREE.Vector3;
  chest: THREE.Vector3;
  ripple: Array<{ id: string; delay: number }>;
}

export function HauntCinematic() {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target?: THREE.Vector3; enabled?: boolean } | null;
  };
  const phase = useStore((s) => s.game?.phase);
  const hauntId = useStore((s) => s.game?.haunt?.id ?? null);
  const busy = useBeats((s) => !!s.active || s.queue.length > 0);
  const played = useRef<string | null>(null);
  const tick = useRef<((state: unknown, delta: number) => void) | null>(null);
  const abortRef = useRef<SynchronousAbortController | null>(null);

  useEffect(() => {
    // Fire once per haunt, and only after the beat that revealed it (usually
    // the final omen card) has drained — the same gate the banner sits behind.
    if (phase !== "haunt" || !hauntId || busy) return;
    if (played.current === hauntId) return;
    const game = useStore.getState().game;
    if (!game?.haunt) return;
    played.current = hauntId;

    // --- frame the shot from live token positions -------------------------
    const traitorId = game.haunt.traitorIds[0] ?? null;
    const anchor = new THREE.Vector3();
    const tok = traitorId ? trackedTokens.get(traitorId) : undefined;
    if (tok) {
      anchor.copy(tok.obj.position);
    } else {
      const room = game.haunt.startRoomKey ? game.house[game.haunt.startRoomKey] : undefined;
      if (room) anchor.set(...roomWorld(room));
      else if (controls?.target) anchor.copy(controls.target);
      else anchor.copy(camera.position).setY(0);
    }
    const chest = anchor.clone();
    chest.y += LOOK_Y;
    // Push in along the current view axis so the dolly is continuous.
    const dir = camera.position.clone().sub(anchor);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const shot = anchor.clone().addScaledVector(dir, SHOT_DIST);
    shot.y = anchor.y + SHOT_RISE;

    // The dread radiates: living explorers (the traitor excepted), nearest
    // first. Procedural fallback figures no-op on playOneShotFor, as before.
    const ripple = game.players
      .filter((p) => p.alive && p.id !== traitorId)
      .map((p) => {
        const t = trackedTokens.get(p.id);
        const d = t ? t.obj.position.distanceTo(anchor) : 8;
        return { id: p.id, delay: 0.55 + Math.min(1.6, d * 0.09) };
      });
    const data: Shot = { traitorId, shot, chest, ripple };

    const ctrl = new SynchronousAbortController();
    abortRef.current = ctrl;
    useBeats.setState({ hauntCinematicHold: true });
    tick.current = runTimeline(buildTimeline(data, camera, controls), ctrl.signal);
    markActive(6000); // the shot must render at full rate throughout
  }, [phase, hauntId, busy, camera, controls]);

  // Abort tears everything down via the scope cleanup (unmount / new game).
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  useFrame((state, dt) => {
    const up = tick.current;
    if (!up) return;
    if (useBeats.getState().worldFrozen) return; // pause with the world
    up(state, Math.min(MAX_FRAME_DT, dt));
  });

  return null;
}

function buildTimeline(
  data: Shot,
  camera: THREE.PerspectiveCamera,
  controls: { target?: THREE.Vector3; enabled?: boolean } | null,
) {
  const { traitorId, shot, chest, ripple } = data;

  return async function* cinematicTimeline() {
    // scope() releases on natural completion AND on abort — the one place
    // the stage handover can't leak.
    yield* scope(function seizeStage(abortSignal) {
      cinematic.active = true;
      if (controls) controls.enabled = false;
      abortSignal.addEventListener(
        "abort",
        () => {
          cinematic.active = false;
          if (controls) controls.enabled = true;
          if (traitorId) avatarHandles.get(traitorId)?.life.setGaze(null);
          useBeats.setState({ hauntCinematicHold: false });
        },
        { once: true },
      );
      return body();
    });
  };

  async function* body() {
    yield* parallel(
      "all",
      // the dolly: camera and look point glide to the close-up together
      async function* flyCamera() {
        yield* action({
          update: transition(camera.position, shot, spring(springPresets.gentle)),
        });
      },
      !!controls?.target &&
        async function* flyLook() {
          yield* action({
            update: transition(controls!.target!, chest, spring(springPresets.gentle)),
          });
        },
      // half a beat in, the traitor's head comes around to the lens
      async function* traitorStare() {
        if (!traitorId) return;
        yield* wait(0.5);
        yield* fire(() => {
          const at = shot.clone();
          at.y -= 0.6; // stare at the lens, not over it
          avatarHandles.get(traitorId)?.life.setGaze(at);
        });
      },
      // the dread radiates outward from the traitor
      ...ripple.map(
        ({ id, delay }) =>
          async function* dread() {
            yield* wait(delay);
            yield* fire(() => playOneShotFor(id, "stagger"));
          },
      ),
    );
    // hold the stare a beat…
    yield* wait(0.7);
    // …then the banner lands over the close-up
    yield* fire(() => useBeats.setState({ hauntCinematicHold: false }));
    // linger while it's read; the scope cleanup hands the stage back after
    yield* wait(1.4);
  }
}
