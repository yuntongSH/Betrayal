import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildExplorerFigure, animateFigure } from "@dread-hollow/decor";

export function PlayerToken({
  position,
  color,
  archetype,
  name,
  isActive,
  isMe,
  side,
}: {
  position: [number, number, number];
  color: string;
  archetype?: string;
  name: string;
  isActive: boolean;
  isMe: boolean;
  side: "heroes" | "traitor" | null;
}) {
  const figure = useMemo(
    () => buildExplorerFigure(color, { archetype }),
    [color, archetype],
  );
  // a stable per-figure phase so identical figures don't bob in lockstep
  const phase = useRef(Math.random() * 6);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    animateFigure(figure, t, {
      active: isActive,
      phase: phase.current,
      baseY: position[1] + 0.02,
    });
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
      <primitive object={figure} />

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
