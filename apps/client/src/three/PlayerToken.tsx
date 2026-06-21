import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildExplorerFigure } from "@dread-hollow/decor";
import type { Group } from "three";

export function PlayerToken({
  position,
  color,
  name,
  isActive,
  isMe,
  side,
}: {
  position: [number, number, number];
  color: string;
  name: string;
  isActive: boolean;
  isMe: boolean;
  side: "heroes" | "traitor" | null;
}) {
  const ref = useRef<Group>(null);
  const figure = useMemo(() => buildExplorerFigure(color), [color]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y =
      position[1] + 0.02 + Math.sin(t * 2) * (isActive ? 0.08 : 0.03);
    ref.current.rotation.y = Math.sin(t * 0.4) * 0.25;
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
      <group ref={ref}>
        <primitive object={figure} />
      </group>

      {/* a bright pillar of light marks whoever is up */}
      {isActive && (
        <>
          <pointLight position={[0, 1.6, 0]} color="#e8a85a" intensity={5} distance={4} />
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.05, 0.5, 3.2, 12, 1, true]} />
            <meshBasicMaterial color="#e8a85a" transparent opacity={0.12} depthWrite={false} />
          </mesh>
        </>
      )}
      {side === "traitor" && (
        <pointLight position={[0, 1, 0]} color="#c2412f" intensity={4} distance={3} />
      )}

      <Html position={[0, 1.9, 0]} center distanceFactor={12} occlude={false}>
        <div className={`token-label ${isMe ? "me" : ""} ${side === "traitor" ? "traitor" : ""}`}>
          {name}
          {side === "traitor" ? " ☠" : ""}
        </div>
      </Html>
    </group>
  );
}
