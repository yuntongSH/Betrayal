/**
 * First-person view — the manor through your explorer's eyes.
 *
 * The rig rides the token's LIVE walk (trackedTokens gives the lerped
 * mid-stride position, so door corridors and ring arcs play out underfoot),
 * with a stride-synced head bob fed by the same tokenSpeeds the locomotion
 * blend uses. Dragging the canvas looks around (yaw free, pitch clamped);
 * entering the mode seeds the look direction from the body's facing.
 *
 * Stage etiquette, in rank order: a world freeze holds the camera exactly
 * where it stands; the haunt cinematic outranks first-person (the reveal
 * push-in still plays, then the eyes return); otherwise this rig writes the
 * camera every frame at priority -1 and publishes `firstPerson.driving` so
 * CameraDirector and the x-ray wall pass (priority 0) stand down. OrbitControls
 * input is held off every frame while driving — the haunt cinematic's cleanup
 * re-enables it blindly, so a one-shot effect could be silently undone.
 *
 * If your explorer falls, the rig releases and the board view returns —
 * spectating a haunted house from inside a corpse helps no one.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../state/store";
import { useBeats } from "../state/beats";
import { useView } from "../state/view";
import { cinematic, firstPerson } from "./director";
import { trackedTokens, MAX_FRAME_DT } from "./followCam";
import { tokenSpeeds, WALK_SPEED } from "./walk";

const EYE_Y = 1.52; // eyes of a ~1.7-unit explorer
const FP_FOV = 68; // wider than the 48° tactical lens — hallways need periphery
const PITCH_LIMIT = 1.0; // rad — no owl necks
const LOOK_SENS = 0.0042; // rad per pixel dragged
/** Head bob: subtle, speed-scaled; frequency rises with stride rate. */
const BOB_AMP = 0.035;
const BOB_BASE_HZ = 1.6;
const BOB_SPEED_HZ = 0.55; // extra Hz per u/s of ground speed

/** Live look state — module-level so KeyboardMover maps arrows to the eyes
 *  without touching React (same registry pattern as walk.ts/followCam.ts). */
export const fpLook = { yaw: 0, pitch: -0.05 };

/** Headless-verify probe: what the rig last wrote (NaN until it drives). */
export const fpCamProbe = { y: NaN, fov: NaN };

/** Nearest compass direction the first-person camera faces — the arrow keys
 *  walk relative to the eyes ("↑ walks where you look"). Camera forward at
 *  yaw 0 is -Z, which is the board's north. */
export function facingDirection(): "north" | "east" | "south" | "west" {
  const fx = -Math.sin(fpLook.yaw);
  const fz = -Math.cos(fpLook.yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? "east" : "west";
  return fz > 0 ? "south" : "north";
}

export function FirstPersonRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | null;
  const mode = useView((s) => s.mode);
  const myId = useStore((s) => s.playerId);
  const alive = useStore((s) => {
    const me = s.game?.players.find((p) => p.id === s.playerId);
    return !!me?.alive;
  });
  const active = mode === "first" && !!myId && alive;

  const look = fpLook;
  const bobT = useRef(0);
  const dragging = useRef(false);
  const wasDriving = useRef(false);
  const lamp = useRef<THREE.PointLight>(null);
  const fill = useRef<THREE.PointLight>(null);

  // Drag to look. Pointer capture keeps the turn alive when the cursor
  // leaves the canvas mid-drag. Deltas come from client coordinates, not
  // movementX/Y — the latter is dead for touch pointers on iOS Safari.
  useEffect(() => {
    if (!active) return;
    const el = gl.domElement;
    const last = { id: -1, x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging.current = true;
      last.id = e.pointerId;
      last.x = e.clientX;
      last.y = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current || e.pointerId !== last.id) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last.x = e.clientX;
      last.y = e.clientY;
      look.yaw -= dx * LOOK_SENS;
      look.pitch = THREE.MathUtils.clamp(look.pitch - dy * LOOK_SENS, -PITCH_LIMIT, PITCH_LIMIT);
    };
    const up = () => {
      dragging.current = false;
      last.id = -1;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      dragging.current = false;
    };
  }, [active, gl]);

  // Entering first person: look the way the body faces (the body's forward is
  // +Z at yaw 0; the camera's is -Z, hence the π offset).
  useEffect(() => {
    if (!active || !myId) return;
    const tok = trackedTokens.get(myId);
    look.yaw = (tok?.obj.rotation.y ?? 0) + Math.PI;
    look.pitch = -0.05;
  }, [active, myId]);

  // The driving flags are module/store singletons — if the whole Canvas
  // unmounts mid-drive (leave to lobby), they must not leak true forever.
  useEffect(
    () => () => {
      if (wasDriving.current) {
        wasDriving.current = false;
        firstPerson.driving = false;
        useView.setState({ driving: false });
      }
    },
    [],
  );

  useFrame((_, rawDt) => {
    // `restoreControls: false` on the cinematic path — the cinematic just
    // seized the stage and disabled orbit input itself; re-enabling here
    // would hand the user drag/zoom over the scripted reveal and let drei's
    // controls.update() fight the timeline for the camera every frame. Its
    // scope cleanup hands the stage back when it ends.
    const release = (restoreControls = true) => {
      if (!wasDriving.current) return;
      wasDriving.current = false;
      firstPerson.driving = false;
      useView.setState({ driving: false });
      if (restoreControls && controls) controls.enabled = true;
      camera.fov = 48; // the tactical lens from Scene.tsx
      camera.updateProjectionMatrix();
      fpCamProbe.fov = camera.fov;
      // OrbitControls re-derives its spherical from the camera each update,
      // so the director eases back out from wherever the eyes were.
    };

    if (!active) return release();
    if (cinematic.active) return release(false); // the house turning outranks the eyes
    const tok = myId ? trackedTokens.get(myId) : undefined;
    if (!tok) return release();

    firstPerson.driving = true;
    if (!wasDriving.current) {
      wasDriving.current = true;
      useView.setState({ driving: true });
    }
    if (controls?.enabled) controls.enabled = false; // re-asserted: the cinematic's cleanup re-enables blindly

    // A world freeze runs the frame at dt 0 (the codebase's freeze contract):
    // the pose writes below become idempotent holds — entering first person
    // MID-freeze still puts the camera in the eyes instead of claiming the
    // frame while leaving the tactical view (and the candle at the origin).
    const dt = useBeats.getState().worldFrozen ? 0 : Math.min(MAX_FRAME_DT, rawDt);
    const speed = tokenSpeeds.get(myId!) ?? 0;
    bobT.current += dt * (BOB_BASE_HZ + speed * BOB_SPEED_HZ) * Math.PI * 2;
    const bob = Math.min(1, speed / WALK_SPEED) * BOB_AMP * Math.sin(bobT.current);

    camera.position.set(tok.obj.position.x, tok.obj.position.y + EYE_Y + bob, tok.obj.position.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(look.pitch, look.yaw, 0);
    if (camera.fov !== FP_FOV) {
      camera.fov = FP_FOV;
      camera.updateProjectionMatrix();
    }
    fpCamProbe.y = camera.position.y;
    fpCamProbe.fov = camera.fov;

    // The held candle rides slightly ahead and below the eyes, flickering the
    // way every other candle in the manor does — without it the room's own
    // pools sit behind you and first person is a black rectangle.
    if (lamp.current) {
      const flicker = 1 + 0.08 * Math.sin(bobT.current * 3.7) + 0.05 * Math.sin(bobT.current * 9.1);
      lamp.current.intensity = 9 * flicker;
      lamp.current.position.set(
        camera.position.x - Math.sin(look.yaw) * 0.45,
        camera.position.y - 0.3,
        camera.position.z - Math.cos(look.yaw) * 0.45,
      );
    }
    fill.current?.position.copy(camera.position);
  }, -1); // before CameraDirector/XrayWalls at 0 — they read firstPerson.driving

  // The candle exists only through your own eyes — everyone else keeps seeing
  // your token's usual pool from PlayerToken.
  return active ? (
    <>
      <pointLight ref={lamp} color="#e8a85a" intensity={9} distance={8} decay={2} />
      {/* a whisper of fill riding the candle — walls you face must never be
          a pure black rectangle, however far the nearest pool */}
      <pointLight ref={fill} color="#8a7455" intensity={1.1} distance={13} decay={1.6} />
    </>
  ) : null;
}
