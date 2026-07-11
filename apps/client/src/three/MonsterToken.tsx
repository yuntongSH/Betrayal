import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildMonsterFigure, animateFigure } from "@dread-hollow/decor";
import * as THREE from "three";
import type { Group } from "three";
import { registerToken, unregisterToken, MAX_FRAME_DT } from "./followCam";
import { followPath, setWalking, type WalkPath } from "./walk";
import { useBeats } from "../state/beats";

function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

export function MonsterToken({
  tokenId,
  position,
  path,
  name,
  hp,
  attackable,
  mental,
  onClick,
}: {
  tokenId: string;
  position: [number, number, number];
  /** Route to walk toward `position` (null = plain glide). Monsters keep the
   *  prowling walk pace even across rooms — the procedural figures have no
   *  run cycle, and a creeping monster is scarier anyway. */
  path?: WalkPath | null;
  name: string;
  hp: number;
  attackable: boolean;
  mental?: boolean;
  onClick: () => void;
}) {
  const figure = useMemo(() => buildMonsterFigure(name), [name]);
  const group = useRef<Group>(null);
  const phase = useRef(Math.random() * 6);
  const yaw = useRef(0);
  const placed = useRef(false);
  const target = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  target.current.set(position[0], position[1], position[2]);
  const prev = useRef(new THREE.Vector3());
  // A fresh path prop restarts waypoint walking from wherever the body stands.
  const activePath = useRef<WalkPath | null | undefined>(undefined);
  const cursor = useRef({ i: 0, traveled: 0 });
  const wasWalking = useRef(false);
  if (activePath.current !== path) {
    activePath.current = path;
    cursor.current.i = 0;
    cursor.current.traveled = 0;
  }

  // Monsters only mount while hp > 0 — track them for the x-ray raycast.
  useEffect(() => {
    if (!group.current) return;
    registerToken(tokenId, group.current, 1.0);
    return () => {
      unregisterToken(tokenId);
      setWalking(tokenId, false);
    };
  }, [tokenId]);

  useFrame((state, rawDt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // Cap hitches (tab-switch, GC) without dropping to slow-motion at low FPS.
    const dt = Math.min(MAX_FRAME_DT, rawDt);
    if (!placed.current) {
      g.position.copy(target.current);
      if (activePath.current) cursor.current.i = activePath.current.points.length; // never walk in from a stale path
      placed.current = true;
    }
    // A modal beat owns the stage — hold position and pose until it drains.
    if (useBeats.getState().worldFrozen) return;
    prev.current.copy(g.position);
    // Same waypoint walk as players; the glide remains for floor jumps.
    const walking = activePath.current
      ? followPath(g.position, activePath.current.points, cursor.current, dt)
      : false;
    if (!walking) g.position.lerp(target.current, 1 - Math.exp(-2.6 * dt));
    const dx = g.position.x - prev.current.x;
    const dz = g.position.z - prev.current.z;
    if (dx * dx + dz * dz > 1e-6) {
      yaw.current = lerpAngle(yaw.current, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    }
    g.rotation.y = yaw.current;
    // Publish stride state so explorers' gaze notices a monster prowling past.
    if (walking !== wasWalking.current) {
      wasWalking.current = walking;
      setWalking(tokenId, walking);
    }
    animateFigure(figure, t, { phase: phase.current, baseY: 0.05 });
  });

  return (
    <group ref={group}>
      <primitive
        object={figure}
        onClick={(e: { stopPropagation: () => void; delta: number }) => {
          if (e.delta > 3) return; // drag release, not a strike
          e.stopPropagation();
          if (attackable) onClick();
        }}
        onPointerOver={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          if (attackable) document.body.style.cursor = "crosshair";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      />
      <pointLight position={[0, 1, 0]} color="#c2412f" intensity={attackable ? 5 : 2.5} distance={5} decay={2} />
      <Html position={[0, 1.9, 0]} center distanceFactor={21} occlude={false}>
        <div className="token-label monster">
          {name}
          {mental ? " ✦" : ""} · {hp}♥{attackable ? " — strike" : ""}
        </div>
      </Html>
    </group>
  );
}
