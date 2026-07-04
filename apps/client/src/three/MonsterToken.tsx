import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildMonsterFigure, animateFigure } from "@dread-hollow/decor";
import * as THREE from "three";
import type { Group } from "three";
import { registerToken, unregisterToken } from "./followCam";

function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

export function MonsterToken({
  tokenId,
  position,
  name,
  hp,
  attackable,
  mental,
  onClick,
}: {
  tokenId: string;
  position: [number, number, number];
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

  // Monsters only mount while hp > 0 — track them for the x-ray raycast.
  useEffect(() => {
    if (!group.current) return;
    registerToken(tokenId, group.current, 1.0);
    return () => unregisterToken(tokenId);
  }, [tokenId]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (!placed.current) {
      g.position.copy(target.current);
      placed.current = true;
    }
    prev.current.copy(g.position);
    g.position.lerp(target.current, 1 - Math.exp(-2.6 * dt)); // same peak world-speed as players at TILE = 7
    const dx = g.position.x - prev.current.x;
    const dz = g.position.z - prev.current.z;
    if (dx * dx + dz * dz > 1e-6) {
      yaw.current = lerpAngle(yaw.current, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    }
    g.rotation.y = yaw.current;
    animateFigure(figure, t, { phase: phase.current, baseY: 0.05 });
  });

  return (
    <group ref={group}>
      <primitive
        object={figure}
        onClick={(e: { stopPropagation: () => void }) => {
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
