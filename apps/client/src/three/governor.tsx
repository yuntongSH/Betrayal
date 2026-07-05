import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useBeats } from "../state/beats";
import { trackedTokens } from "./followCam";

/**
 * Performance governor — the client is a BOARD game, yet it used to re-render
 * the full scene (shadow pass + postFX chain) every vsync even while nothing
 * moved. Two disciplines fix the overheating reports:
 *
 * 1. IDLE RENDER THROTTLING. The rAF loop stays "always" — every dt-based
 *    useFrame system (walks, camera easing, wisp flicker, mixers) keeps
 *    ticking, because they are cheap CPU — but the actual GL work is gated at
 *    the single point it all happens: PostFX's composer.render() (the
 *    RenderPass, the shadow-map update and every postFX pass live inside it).
 *    While the scene is QUIET we render at ~24 fps; while ACTIVE, every tick.
 *    We chose this over `frameloop="demand"` because demand halts ALL
 *    useFrame consumers, and every flicker/ease/mixer would then need its own
 *    invalidation plumbing; skipping the composer render provably skips 100%
 *    of the GPU cost while keeping the sims trivially correct (dt-based).
 *
 *    ACTIVE = any tracked token moved last tick (walks, glides, monsters),
 *    the camera or orbit target moved (chase, pulses, damping), user input on
 *    the canvas within the last 1.5 s, BeatFX particles alive (it pings us),
 *    or a world freeze/unfreeze transition this frame.
 *
 * 2. ADAPTIVE DPR. Initial pixel ratio is min(1.5, devicePixelRatio); a
 *    rolling frame-time average walks the [1.5, 1.25, 1.0, 0.8] ladder:
 *    sustained > 34 ms steps down, sustained < 20 ms for ~10 s steps back up,
 *    never more than one step per 3 s, with a dead-band between the
 *    thresholds so it cannot thrash. Frame times are sampled only on ticks
 *    that follow a rendered tick, so the idle cadence's deliberate 40 ms gaps
 *    never read as "slow".
 *
 * DOM-side systems (card-hold timers, dice trays, auto-end, music, minimap)
 * are setTimeout/CSS/store-driven — they never ride the rAF loop, so the
 * throttle cannot touch them.
 */

/** Pixel-ratio ladder, best to cheapest. Keep in sync with the artifact. */
export const DPR_NOTCHES = [1.5, 1.25, 1.0, 0.8] as const;
/** Initial pixel ratio: never above 1.5 — retina 2x is heat, not fidelity. */
export const INITIAL_DPR = Math.min(
  1.5,
  typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
);

const SLOW_MS = 34; // sustained above → step the ladder down
const FAST_MS = 20; // sustained below → step back up (dead-band between)
const SLOW_HOLD_S = 1.5; // how long "sustained slow" must last
const FAST_HOLD_S = 10; // how long "sustained fast" must last
const STEP_COOLDOWN_MS = 3000; // at most one ladder step per 3 s
const IDLE_FPS = 24; // render cadence while the board is quiet
const IDLE_FRAME_MS = 1000 / IDLE_FPS;
const INPUT_HOLD_MS = 1500; // user orbit/zoom keeps full rate this long
const MOVED_EPS_SQ = 1e-6; // squared world-units: "did it move this tick"
const SAMPLE_CLAMP_MS = 250; // cap single-tick spikes feeding the average
const HITCH_IGNORE_MS = 1000; // tab-switch/GC pauses are not frame times

/** Read by PostFX each tick: render this frame? (Governor writes, first.) */
export const renderGate = { render: true, active: true };

let activeUntil = typeof performance !== "undefined" ? performance.now() + 2000 : 0;

/** External activity ping (BeatFX particles, freeze transitions, steps…). */
export function markActive(holdMs: number): void {
  const until = performance.now() + holdMs;
  if (until > activeUntil) activeUntil = until;
}

/** Dev/verify counters — cheap writes, read by the perf harness. */
export const perfCounters = {
  ticks: 0,
  renders: 0,
  activeTicks: 0,
  dpr: INITIAL_DPR,
  emaMs: 1000 / 60,
};
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__dreadPerf = perfCounters;
}

export function PerfGovernor() {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const size = useThree((s) => s.size);

  // The highest notch this device may climb to (initial cap, see INITIAL_DPR).
  const minIdx = DPR_NOTCHES.findIndex((n) => n <= INITIAL_DPR + 1e-3);
  const topIdx = minIdx === -1 ? DPR_NOTCHES.length - 1 : minIdx;

  const idx = useRef(topIdx);
  const ema = useRef(1000 / 60);
  const slowFor = useRef(0);
  const fastFor = useRef(0);
  const lastStepAt = useRef(0);
  const bornAt = useRef(0);
  const quietAccum = useRef(0);
  const prevRendered = useRef(true);
  const lastCam = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const lastTarget = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const lastTokens = useRef(new Map<string, THREE.Vector3>());

  // User orbit/zoom input → full rate for the next 1.5 s (covers damping).
  useEffect(() => {
    const el = gl.domElement;
    const onDown = () => markActive(INPUT_HOLD_MS);
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) markActive(INPUT_HOLD_MS);
    };
    const onWheel = () => markActive(INPUT_HOLD_MS);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl]);

  // A modal beat freezing/unfreezing the world is a visual transition — make
  // sure the frames around it render at full rate.
  useEffect(
    () =>
      useBeats.subscribe((s, prev) => {
        if (s.worldFrozen !== prev.worldFrozen) markActive(400);
      }),
    [],
  );

  // A resize clears the drawing buffer — render immediately, never show black.
  useEffect(() => {
    markActive(300);
  }, [size]);

  // Runs FIRST each tick (negative priority never takes over rendering) and
  // publishes this tick's verdict for PostFX (priority 1, the actual render).
  useFrame((state, rawDt) => {
    const now = performance.now();
    if (bornAt.current === 0) bornAt.current = now;
    perfCounters.ticks++;

    // ---- activity: token motion since last tick (walks, glides, monsters) —
    // tokens/camera move at priority 0, after us, so deltas lag one tick;
    // motion spans many ticks, so that costs at most one 16 ms frame.
    let active = now < activeUntil;
    const tokens = lastTokens.current;
    for (const [id, { obj }] of trackedTokens) {
      const last = tokens.get(id);
      if (!last) {
        tokens.set(id, obj.position.clone());
        active = true; // a token just appeared
      } else {
        if (obj.position.distanceToSquared(last) > MOVED_EPS_SQ) active = true;
        last.copy(obj.position);
      }
    }
    if (tokens.size > trackedTokens.size) {
      for (const id of tokens.keys()) if (!trackedTokens.has(id)) tokens.delete(id);
    }

    // ---- activity: camera or orbit-target motion (chase, pulses, damping).
    // (NaN seeds fail the > test on the first tick; the 2 s startup window
    // in `activeUntil` covers the opening frames regardless.)
    const cam = state.camera;
    if (cam.position.distanceToSquared(lastCam.current) > MOVED_EPS_SQ) active = true;
    lastCam.current.copy(cam.position);
    const target = (state.controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    if (target) {
      if (target.distanceToSquared(lastTarget.current) > MOVED_EPS_SQ) active = true;
      lastTarget.current.copy(target);
    }

    // ---- verdict: full rate while active, ~24 fps while quiet.
    let render = true;
    if (active) {
      quietAccum.current = 0;
    } else {
      quietAccum.current += rawDt * 1000;
      if (quietAccum.current >= IDLE_FRAME_MS) {
        quietAccum.current = Math.min(quietAccum.current - IDLE_FRAME_MS, IDLE_FRAME_MS);
      } else {
        render = false;
      }
    }
    renderGate.render = render;
    renderGate.active = active;
    if (active) perfCounters.activeTicks++;

    // ---- adaptive DPR: sample only ticks that FOLLOW a rendered tick (their
    // dt carries that render's cost); idle-cadence gaps are never sampled.
    const dtMs = rawDt * 1000;
    if (
      prevRendered.current &&
      dtMs < HITCH_IGNORE_MS &&
      now - bornAt.current > 2000 // startup grace: loads/compiles aren't frame cost
    ) {
      const sample = Math.min(dtMs, SAMPLE_CLAMP_MS);
      ema.current += (sample - ema.current) * (1 - Math.exp(-rawDt / 0.5));
      perfCounters.emaMs = ema.current;
      if (ema.current > SLOW_MS) {
        slowFor.current += rawDt;
        fastFor.current = 0;
      } else if (ema.current < FAST_MS) {
        fastFor.current += rawDt;
        slowFor.current = 0;
      } else {
        // dead-band: neither counter accrues — hysteresis against thrash
        slowFor.current = 0;
        fastFor.current = 0;
      }
      if (now - lastStepAt.current >= STEP_COOLDOWN_MS) {
        let next = idx.current;
        if (slowFor.current >= SLOW_HOLD_S && idx.current < DPR_NOTCHES.length - 1) {
          next = idx.current + 1;
        } else if (fastFor.current >= FAST_HOLD_S && idx.current > topIdx) {
          next = idx.current - 1;
        }
        if (next !== idx.current) {
          idx.current = next;
          const dpr = Math.min(DPR_NOTCHES[next]!, INITIAL_DPR);
          setDpr(dpr);
          perfCounters.dpr = dpr;
          lastStepAt.current = now;
          slowFor.current = 0;
          fastFor.current = 0;
          ema.current = (SLOW_MS + FAST_MS) / 2; // re-settle inside the dead-band
          markActive(400); // buffer resize cleared the canvas — render now
        }
      }
    }
    prevRendered.current = render;
  }, -100);

  return null;
}
