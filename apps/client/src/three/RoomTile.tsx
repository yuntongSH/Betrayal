import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { DIRECTIONS, placedDoorways } from "@dread-hollow/shared";
import type { PlacedRoom, RoomDef } from "@dread-hollow/shared";
import { TILE, WALL_H, roomWorld } from "./layout";

const SPECIAL_GLOW: Record<string, string | undefined> = {
  "heal-sanity": "#6fb6b5",
  "heal-might": "#e8a85a",
  "drain-speed": "#5a6f9a",
  pit: "#3a2a2a",
  "draw-extra-omen": "#8c2f23",
  "pentagram-chamber": "#8c2f23",
  vault: "#c8a23a",
};

const HALF = TILE / 2;

export function RoomTile({
  room,
  def,
  highlighted,
  onClick,
}: {
  room: PlacedRoom;
  def: RoomDef;
  highlighted: boolean;
  onClick: () => void;
}) {
  const [wx, wy, wz] = roomWorld(room);
  const doors = useMemo(() => placedDoorways(room), [room]);
  const glow = SPECIAL_GLOW[def.special];

  return (
    <group position={[wx, wy, wz]}>
      {/* floor slab — the clickable surface for movement */}
      <mesh
        position={[0, -0.15, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (highlighted) document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[TILE, 0.3, TILE]} />
        <meshStandardMaterial
          color={highlighted ? "#3a4a3a" : "#1c1812"}
          emissive={highlighted ? "#5a8f5a" : "#000000"}
          emissiveIntensity={highlighted ? 0.5 : 0}
          roughness={0.95}
          metalness={0.05}
        />
      </mesh>

      {/* walls on every edge that has no doorway */}
      {DIRECTIONS.filter((d) => !doors.has(d)).map((d) => {
        const pos: [number, number, number] =
          d === "north"
            ? [0, WALL_H / 2, -HALF]
            : d === "south"
              ? [0, WALL_H / 2, HALF]
              : d === "east"
                ? [HALF, WALL_H / 2, 0]
                : [-HALF, WALL_H / 2, 0];
        const size: [number, number, number] =
          d === "north" || d === "south"
            ? [TILE, WALL_H, 0.2]
            : [0.2, WALL_H, TILE];
        return (
          <mesh key={d} position={pos} castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color="#2a2018" roughness={1} />
          </mesh>
        );
      })}

      {glow && (
        <pointLight
          position={[0, WALL_H * 0.7, 0]}
          color={glow}
          intensity={6}
          distance={TILE * 2.2}
          decay={2}
        />
      )}

      <Html
        position={[0, WALL_H + 0.4, 0]}
        center
        distanceFactor={14}
        occlude={false}
      >
        <div className={`room-label ${highlighted ? "lit" : ""}`}>{def.name}</div>
      </Html>
    </group>
  );
}
