import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { DIRECTIONS, placedDoorways } from "@dread-hollow/shared";
import type { PlacedRoom, RoomDef } from "@dread-hollow/shared";
import { buildRoomDecor, roomTheme } from "@dread-hollow/decor";
import { TILE, WALL_H, roomWorld } from "./layout";

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
  const theme = useMemo(() => roomTheme(room.roomId), [room.roomId]);
  // The decorations are vanilla three Groups, memoized for the tile's lifetime.
  const decor = useMemo(() => buildRoomDecor(room.roomId, TILE), [room.roomId]);

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
          color={highlighted ? "#3a4a3a" : theme.floor}
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
          <mesh key={d} position={pos} castShadow receiveShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color={theme.wall} roughness={1} />
          </mesh>
        );
      })}

      {/* the room's themed furnishings */}
      <primitive object={decor} />

      {/* a per-room accent light for vibe */}
      <pointLight
        position={[0, WALL_H * 0.75, 0]}
        color={theme.accent}
        intensity={theme.accentIntensity * 6}
        distance={TILE * 2.4}
        decay={2}
      />

      <Html position={[0, WALL_H + 0.4, 0]} center distanceFactor={14} occlude={false}>
        <div className={`room-label ${highlighted ? "lit" : ""}`}>{def.name}</div>
      </Html>
    </group>
  );
}
