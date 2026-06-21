import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
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

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    // gentle hover; the active explorer bobs a touch more.
    ref.current.position.y = position[1] + 0.6 + Math.sin(t * 2) * (isActive ? 0.12 : 0.05);
  });

  return (
    <group ref={ref} position={[position[0], position[1] + 0.6, position[2]]}>
      {/* body */}
      <mesh castShadow position={[0, 0.35, 0]}>
        <capsuleGeometry args={[0.22, 0.5, 4, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={isActive ? color : "#000000"}
          emissiveIntensity={isActive ? 0.6 : 0}
          roughness={0.5}
        />
      </mesh>
      {/* base ring */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.42, 24]} />
        <meshBasicMaterial color={isActive ? "#e8a85a" : color} transparent opacity={isActive ? 0.9 : 0.35} />
      </mesh>
      {side === "traitor" && (
        <pointLight position={[0, 0.6, 0]} color="#c2412f" intensity={4} distance={3} />
      )}
      <Html position={[0, 1.1, 0]} center distanceFactor={12} occlude={false}>
        <div className={`token-label ${isMe ? "me" : ""} ${side === "traitor" ? "traitor" : ""}`}>
          {name}
          {side === "traitor" ? " ☠" : ""}
        </div>
      </Html>
    </group>
  );
}
