import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { DIRECTIONS, placedDoorways } from "@dread-hollow/shared";
import type { PlacedRoom, RoomDef } from "@dread-hollow/shared";
import { buildRoomDecor, roomTheme, materials, surfaceFor } from "@dread-hollow/decor";
import { TILE, WALL_H, roomWorld } from "./layout";

const HALF = TILE / 2;

export function RoomTile({
  room,
  def,
  highlighted,
  litFactor = 1,
  onClick,
}: {
  room: PlacedRoom;
  def: RoomDef;
  highlighted: boolean;
  /** Fog-of-war brightness 0..1 — how near a living explorer's light this is. */
  litFactor?: number;
  onClick: () => void;
}) {
  const [wx, wy, wz] = roomWorld(room);
  const doors = useMemo(() => placedDoorways(room), [room]);
  const theme = useMemo(() => roomTheme(room.roomId), [room.roomId]);
  const surf = useMemo(() => surfaceFor(room.roomId), [room.roomId]);
  // The decorations are vanilla three Groups, memoized for the tile's lifetime.
  const decor = useMemo(() => buildRoomDecor(room.roomId, TILE), [room.roomId]);

  // Procedural floor + wall materials (fresh per tile; cached textures shared).
  const floorMat = useMemo(
    () =>
      surf.floor === "stone"
        ? materials.crackedStone({ tint: theme.floor })
        : materials.agedHardwood({ tint: theme.floor }),
    [room.roomId, theme.floor]
  );
  const wallMat = useMemo(
    () =>
      surf.wall === "wallpaper"
        ? materials.peelingWallpaper({ tint: theme.wall })
        : surf.wall === "stone"
          ? materials.crackedStone({ tint: theme.wall })
          : materials.stainedPlaster({ tint: theme.wall }),
    [room.roomId, theme.wall]
  );

  // Track the highlight on the (mutable) floor material each render.
  if (highlighted) {
    floorMat.emissive.set("#5a8f5a");
    floorMat.emissiveIntensity = 0.5;
  } else {
    floorMat.emissiveIntensity = 0;
  }
  // Fog-of-war: darken the floor for rooms far from any explorer's light.
  floorMat.color.set(theme.floor);
  floorMat.color.multiplyScalar(0.35 + 0.65 * litFactor);

  return (
    <group position={[wx, wy, wz]}>
      {/* floor slab — the clickable surface for movement */}
      <mesh
        position={[0, -0.15, 0]}
        receiveShadow
        material={floorMat}
        userData={{ kind: "room", key: room.key }}
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
          <mesh key={d} position={pos} castShadow receiveShadow material={wallMat}>
            <boxGeometry args={size} />
          </mesh>
        );
      })}

      {/* the room's themed furnishings */}
      <primitive object={decor} />

      {/* per-room candle-pool: lower + tighter falloff gives a bright pool with
          a dark edge instead of a flat fill */}
      <pointLight
        position={[0, WALL_H * 0.55, 0]}
        color={theme.accent}
        intensity={theme.accentIntensity * 7 * litFactor}
        distance={TILE * 1.9}
        decay={2.2}
      />

      <Html position={[0, WALL_H + 0.4, 0]} center distanceFactor={14} occlude={false}>
        <div className={`room-label ${highlighted ? "lit" : ""}`}>
          {def.name}
          {def.aura ? (def.aura > 0 ? " ✦" : " ☓") : ""}
        </div>
      </Html>
    </group>
  );
}
