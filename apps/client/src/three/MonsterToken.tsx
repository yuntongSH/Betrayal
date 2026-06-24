import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { buildMonsterFigure, animateFigure } from "@dread-hollow/decor";

export function MonsterToken({
  position,
  name,
  hp,
  attackable,
  mental,
  onClick,
}: {
  position: [number, number, number];
  name: string;
  hp: number;
  attackable: boolean;
  mental?: boolean;
  onClick: () => void;
}) {
  const figure = useMemo(() => buildMonsterFigure(name), [name]);
  const phase = useRef(Math.random() * 6);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    animateFigure(figure, t, { phase: phase.current, baseY: position[1] + 0.05 });
  });

  return (
    <group position={[position[0], position[1], position[2]]}>
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
      <pointLight position={[0, 1, 0]} color="#c2412f" intensity={attackable ? 5 : 2.5} distance={4} decay={2} />
      <Html position={[0, 1.9, 0]} center distanceFactor={12} occlude={false}>
        <div className="token-label monster">
          {name}
          {mental ? " ✦" : ""} · {hp}♥{attackable ? " — strike" : ""}
        </div>
      </Html>
    </group>
  );
}
