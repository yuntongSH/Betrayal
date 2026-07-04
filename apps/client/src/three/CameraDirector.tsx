import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { roomWorld } from "./layout";
import { followTarget } from "./followCam";
import { director } from "./director";

/** Tactical orbit distance while whoever is up stands still (bots framed a
 *  touch tighter — spectating, not driving). */
const TACTICAL_DIST_HUMAN = 20;
const TACTICAL_DIST_BOT = 17;
/** Chase framing while the active explorer walks: low, close, behind. */
const CHASE_DIST = 7.0;
const CHASE_PHI = 1.12; // ≈26° above horizon — the camera just clears the 3.2 walls
const CHASE_LOOK_Y = 1.2; // chest of a ~1.7-unit avatar
const TACT_LOOK_Y = 1.0; // look a little above the room's floor center
const PHI_INIT = 0.94; // matches the initial camera placement in Scene
/** Easing rates (s⁻¹) — all applied as frame-rate-independent exponentials. */
const CHASE_IN_RATE = 5.0; // swoop commits fast, so even a one-room hop reads close
const CHASE_OUT_RATE = 1.2;
const DIST_IN_RATE = 3.5; // dolly shrinks briskly toward the chase framing…
const DIST_OUT_RATE = 2.2; // …and relaxes back out at the old leisurely pace
const PHI_RATE = 2.5;
const THETA_RATE = 2.0; // scaled by chase, so azimuth only swings mid-walk
const TARGET_RATE = 3.5;
const TARGET_RATE_FAR = 5.0; // brisk pan when the target is > 10 units away (turn handoff)
const MANUAL_HOLD_MS = 2500;
/** The human's swoop engages almost at once and holds through chained
 *  arrow-key hops as one continuous chase; bots keep the calmer debounce
 *  (spectating, not driving). */
const MOVE_DEBOUNCE_HUMAN = 0.05; // s of motion before the swoop-in commits
const MOVE_DEBOUNCE_BOT = 0.12;
const STILL_DEBOUNCE_HUMAN = 0.7; // s of stillness before easing back out
const STILL_DEBOUNCE_BOT = 0.45;
/** Beat push-in (focusPulse): dolly to 55% of tactical, faster target/dolly rates. */
const PULSE_DIST_SCALE = 0.55;
const PULSE_TARGET_RATE = 5.0;
const PULSE_DIST_RATE = 3.7;

/**
 * Cinematic camera director. Two framings blended by a single `chase` scalar:
 * a high tactical orbit of the active player's room, and a low third-person
 * chase behind the active explorer while they walk (swoop in over ~0.4 s, relax
 * back over ~2 s after arrival). Manual orbit/zoom freezes the framing for a
 * beat — the target soft-follow keeps running so the action stays centered —
 * and beat reveals (focusPulse) push in on the room where something happened.
 */
export function CameraDirector() {
  const game = useStore((s) => s.game);
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls:
      | {
          target?: THREE.Vector3;
          minDistance?: number;
          maxDistance?: number;
          addEventListener?: (type: string, fn: () => void) => void;
          removeEventListener?: (type: string, fn: () => void) => void;
        }
      | null;
  };
  const look = useRef(new THREE.Vector3(0, 0, 7));
  const chest = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());
  const sph = useRef(new THREE.Spherical());
  const userCamAt = useRef(0);
  const chase = useRef(0);
  const chaseWant = useRef(0);
  const movingFor = useRef(0);
  const stillFor = useRef(9);
  const polarSaved = useRef(PHI_INIT);

  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      userCamAt.current = performance.now();
    };
    controls.addEventListener?.("start", onStart);
    return () => controls.removeEventListener?.("start", onStart);
  }, [controls]);

  useFrame((_, rawDt) => {
    if (!game || !controls?.target) return;
    const dt = Math.min(0.05, rawDt);
    const now = performance.now();
    const active = game.players.find((p) => p.id === game.activePlayerId);
    const room = active?.position ? game.house[active.position] : undefined;
    const ft = followTarget;

    // 1. moving signal: debounce the token's walk-hysteresis state so a single
    //    stutter never twitches the camera, then ease the chase blend.
    const isBot = !!active?.isBot;
    if (ft.valid && ft.moving) {
      movingFor.current += dt;
      stillFor.current = 0;
    } else {
      stillFor.current += dt;
      movingFor.current = 0;
    }
    if (movingFor.current > (isBot ? MOVE_DEBOUNCE_BOT : MOVE_DEBOUNCE_HUMAN))
      chaseWant.current = 1;
    else if (stillFor.current > (isBot ? STILL_DEBOUNCE_BOT : STILL_DEBOUNCE_HUMAN))
      chaseWant.current = 0;
    chase.current +=
      (chaseWant.current - chase.current) *
      (1 - Math.exp(-(chaseWant.current > chase.current ? CHASE_IN_RATE : CHASE_OUT_RATE) * dt));

    // 2. look point: room center (tactical) -> the walker's chest (chase);
    //    a live focusPulse retargets onto the beat's room instead, and fully
    //    owns the look while it lasts. A stale pulse (a bot-beat fired at the
    //    end of the previous turn) must never hijack the human's own move:
    //    once their chase engages, the pulse is expired.
    if (now < director.until && chase.current > 0.3 && active && !isBot) {
      director.until = 0;
    }
    const pulseRoom =
      now < director.until && director.focusKey ? game.house[director.focusKey] : undefined;
    const baseRoom = pulseRoom ?? room;
    if (baseRoom) {
      const [rx, ry, rz] = roomWorld(baseRoom);
      look.current.set(rx, ry + TACT_LOOK_Y, rz);
    } else {
      look.current.copy(controls.target);
    }
    if (!pulseRoom && ft.valid) {
      chest.current.set(ft.pos.x, ft.pos.y + CHASE_LOOK_Y, ft.pos.z);
      look.current.lerp(chest.current, chase.current);
    }
    const err = controls.target.distanceTo(look.current);
    const targetRate = pulseRoom ? PULSE_TARGET_RATE : err > 10 ? TARGET_RATE_FAR : TARGET_RATE;
    controls.target.lerp(look.current, 1 - Math.exp(-targetRate * dt));

    // 3. manual override: a recent user grab freezes the framing writes below
    //    (a focusPulse still dollies — the reveal is worth interrupting for).
    const manual = now - userCamAt.current < MANUAL_HOLD_MS;

    // 4. spherical framing (radius / polar / azimuth) around the target.
    if (!manual || pulseRoom) {
      offset.current.copy(camera.position).sub(controls.target);
      sph.current.setFromVector3(offset.current);
      // remember the user's preferred tilt while fully tactical
      if (chase.current < 0.02 && chaseWant.current === 0) {
        polarSaved.current = THREE.MathUtils.clamp(sph.current.phi, 0.2, 1.45);
      }
      const min = controls.minDistance ?? 5;
      const max = controls.maxDistance ?? 100;
      const tactical = isBot ? TACTICAL_DIST_BOT : TACTICAL_DIST_HUMAN;
      let wantDist = THREE.MathUtils.lerp(tactical, CHASE_DIST, chase.current);
      if (pulseRoom) wantDist = Math.max(min, PULSE_DIST_SCALE * tactical);
      const clamped = THREE.MathUtils.clamp(wantDist, min, max);
      // dolly in briskly, relax back out gently; a pulse pushes fastest of all
      const distRate = pulseRoom
        ? PULSE_DIST_RATE
        : clamped < sph.current.radius
          ? DIST_IN_RATE
          : DIST_OUT_RATE;
      sph.current.radius += (clamped - sph.current.radius) * (1 - Math.exp(-distRate * dt));
      if (!manual) {
        sph.current.phi +=
          (THREE.MathUtils.lerp(polarSaved.current, CHASE_PHI, chase.current) - sph.current.phi) *
          (1 - Math.exp(-PHI_RATE * dt));
        // swing BEHIND the walker, shortest arc, only while chasing
        if (chase.current > 0.05 && ft.valid) {
          const thetaBehind = ft.yaw + Math.PI; // token yaw = atan2(dx, dz) of travel
          const d =
            ((((thetaBehind - sph.current.theta + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
              (Math.PI * 2)) -
            Math.PI;
          sph.current.theta += d * (1 - Math.exp(-THETA_RATE * chase.current * dt));
        }
      }
      camera.position.setFromSpherical(sph.current).add(controls.target);
    }

    // consumed — the active token re-asserts it next frame if still alive
    ft.valid = false;
  });

  return null;
}
