import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildMonsterFigure } from "@dread-hollow/decor";
import type { Group } from "three";

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
  const ref = useRef<Group>(null);
  const figure = useMemo(() => buildMonsterFigure(name), [name]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * 0.5;
    ref.current.position.y = position[1] + 0.05 + Math.sin(t * 3) * 0.08;
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
      <group
        ref={ref}
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
        <primitive object={figure} />
      </group>
      <pointLight position={[0, 1, 0]} color="#c2412f" intensity={attackable ? 5 : 2.5} distance={4} decay={2} />
      <Html position={[0, 1.9, 0]} center distanceFactor={12} occlude={false}>
        <div className="token-label monster">
          {name} · {hp}♥{attackable ? " — strike" : ""}
        </div>
      </Html>
    </group>
  );
}
