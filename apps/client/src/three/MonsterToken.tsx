import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Mesh } from "three";

export function MonsterToken({
  position,
  name,
  hp,
  attackable,
  onClick,
}: {
  position: [number, number, number];
  name: string;
  hp: number;
  attackable: boolean;
  onClick: () => void;
}) {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * 0.6;
    ref.current.position.y = position[1] + 0.8 + Math.sin(t * 3) * 0.1;
  });

  return (
    <group position={[position[0], 0, position[2]]}>
      <mesh
        ref={ref}
        position={[0, position[1] + 0.8, 0]}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          if (attackable) onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (attackable) document.body.style.cursor = "crosshair";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color="#1a0e0e"
          emissive={attackable ? "#c2412f" : "#5a1d15"}
          emissiveIntensity={attackable ? 1.1 : 0.5}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>
      <pointLight position={[0, position[1] + 0.8, 0]} color="#c2412f" intensity={3} distance={3.5} decay={2} />
      <Html position={[0, position[1] + 1.6, 0]} center distanceFactor={12} occlude={false}>
        <div className="token-label monster">
          {name} · {hp}♥{attackable ? " — strike" : ""}
        </div>
      </Html>
    </group>
  );
}
