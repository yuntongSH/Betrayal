import { useEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { DIRECTIONS, placedDoorways } from "@dread-hollow/shared";
import type { Direction, PlacedRoom, RoomDef } from "@dread-hollow/shared";
import { buildRoomDecor, roomTheme, materials, surfaceFor } from "@dread-hollow/decor";
import { TILE, WALL_H, roomWorld } from "./layout";
import { registerWall, unregisterWall } from "./followCam";

const HALF = TILE / 2;

/** Fog-of-war culling: rooms far from every living explorer stop rendering
 *  their decor and accent light (floor, walls and label stay, so the dollhouse
 *  silhouette survives and walls stay x-ray-registered). Hysteresis — hide
 *  below DECOR_HIDE_LIT, show again only at/above DECOR_SHOW_LIT — so a room
 *  sitting on the threshold can't flip-flop and thrash shader recompiles. */
const DECOR_HIDE_LIT = 0.2;
const DECOR_SHOW_LIT = 0.24;

/** Unit outward normals per wall edge, for the x-ray "camera-facing" test. */
const WALL_NORMAL: Record<Direction, THREE.Vector3> = {
  north: new THREE.Vector3(0, 0, -1),
  south: new THREE.Vector3(0, 0, 1),
  east: new THREE.Vector3(1, 0, 0),
  west: new THREE.Vector3(-1, 0, 0),
};

export function RoomTile({
  room,
  def,
  highlighted,
  litFactor = 1,
  lightOn = true,
  onClick,
}: {
  room: PlacedRoom;
  def: RoomDef;
  highlighted: boolean;
  /** Fog-of-war brightness 0..1 — how near a living explorer's light this is. */
  litFactor?: number;
  /** Light budget (HouseView): only the ~10 best-lit rooms keep their accent
   *  pointLight visible — an invisible light frees the shader entirely. */
  lightOn?: boolean;
  onClick: () => void;
}) {
  const [wx, wy, wz] = roomWorld(room);
  const doors = useMemo(() => placedDoorways(room), [room]);
  const theme = useMemo(() => roomTheme(room.roomId), [room.roomId]);
  const surf = useMemo(() => surfaceFor(room.roomId), [room.roomId]);
  // The decorations are vanilla three Groups, memoized for the tile's lifetime.
  const decor = useMemo(() => buildRoomDecor(room.roomId, TILE, { doors }), [room.roomId, doors]);

  // Wall-height trim (cornice, beams, pilasters — tagged `userData.xrayTrim`
  // by the decor package) must ghost with the room's walls, or faded walls
  // leave floating opaque bars over the characters. One proxy mesh per
  // material carries the union box (room-local here; world after mount): a
  // zero normal + this room's key means pass B ghosts it whenever the room is
  // followed, and its material dims with fog-of-war via `userData.baseColor`.
  const trim = useMemo(() => {
    const byMat = new Map<THREE.MeshStandardMaterial, { proxy: THREE.Mesh; box: THREE.Box3 }>();
    const mb = new THREE.Box3();
    decor.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isMesh || !m.userData.xrayTrim) return;
      if (m.isInstancedMesh) {
        m.computeBoundingBox();
        mb.copy(m.boundingBox!);
      } else {
        m.geometry.computeBoundingBox();
        mb.copy(m.geometry.boundingBox!);
      }
      for (let p: THREE.Object3D | null = m; p && p !== decor; p = p.parent) {
        p.updateMatrix();
        mb.applyMatrix4(p.matrix);
      }
      const mat = m.material as THREE.MeshStandardMaterial;
      const seen = byMat.get(mat);
      if (seen) seen.box.union(mb);
      else byMat.set(mat, { proxy: m, box: mb.clone() });
    });
    return [...byMat.entries()].map(([mat, e]) => ({ mat, proxy: e.proxy, box: e.box }));
  }, [decor]);

  // Procedural floor + wall materials (fresh per tile; cached textures shared).
  const floorMat = useMemo(
    () =>
      surf.floor === "stone"
        ? materials.crackedStone({ tint: theme.floor })
        : materials.agedHardwood({ tint: theme.floor }),
    [room.roomId, theme.floor]
  );
  // One material instance PER wall (textures are cached, so this is cheap):
  // the x-ray system fades each occluding wall's opacity independently.
  const wallMats = useMemo(() => {
    const make = () =>
      surf.wall === "wallpaper"
        ? materials.peelingWallpaper({ tint: theme.wall })
        : surf.wall === "stone"
          ? materials.crackedStone({ tint: theme.wall })
          : materials.stainedPlaster({ tint: theme.wall });
    return {
      north: make(),
      south: make(),
      east: make(),
      west: make(),
    } as Record<Direction, THREE.MeshStandardMaterial>;
  }, [room.roomId, theme.wall]);

  // Walls this tile has registered with the x-ray system; freed on unmount.
  const wallsRef = useRef(new Set<THREE.Mesh>());
  useEffect(() => {
    const walls = wallsRef.current;
    return () => {
      for (const w of walls) unregisterWall(w);
      walls.clear();
    };
  }, []);

  // Register the trim proxies alongside the walls (same lifetime/cleanup).
  useEffect(() => {
    for (const t of trim) {
      if (!t.proxy.userData.xray) {
        t.proxy.userData.xray = {
          until: 0,
          roomKeys: [room.key],
          normal: new THREE.Vector3(),
          box: t.box.clone().translate(new THREE.Vector3(wx, wy, wz)),
        };
      }
      wallsRef.current.add(t.proxy);
      registerWall(t.proxy);
    }
  }, [trim, room.key, wx, wy, wz]);

  // Deep-fog culling with hysteresis (see DECOR_HIDE_LIT/DECOR_SHOW_LIT).
  const decorHidden = useRef(false);
  if (litFactor < DECOR_HIDE_LIT) decorHidden.current = true;
  else if (litFactor >= DECOR_SHOW_LIT) decorHidden.current = false;
  const dimmed = decorHidden.current;

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
  // …and the wall-height trim with it (decor contract: baseColor * lit curve),
  // so unlit rooms don't show near-black bars over emissive-highlighted floors.
  for (const t of trim) {
    t.mat.color.set(t.mat.userData.baseColor as number).multiplyScalar(0.35 + 0.65 * litFactor);
  }

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

      {/* walls on every edge that has no doorway — each tagged + registered for
          the x-ray fade (walls are static, so the world box is computed once) */}
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
          <mesh
            key={d}
            position={pos}
            castShadow
            receiveShadow
            material={wallMats[d]}
            ref={(m) => {
              if (!m) return;
              if (!m.userData.xray) {
                m.userData.xray = {
                  until: 0,
                  roomKeys: [room.key],
                  normal: WALL_NORMAL[d],
                  box: new THREE.Box3().setFromCenterAndSize(
                    new THREE.Vector3(wx + pos[0], wy + pos[1], wz + pos[2]),
                    new THREE.Vector3(size[0], size[1], size[2])
                  ),
                };
              }
              // Set-backed, so re-running on every render/remount is harmless.
              wallsRef.current.add(m);
              registerWall(m);
            }}
          >
            <boxGeometry args={size} />
          </mesh>
        );
      })}

      {/* the room's themed furnishings (hidden deep in the fog — the floor,
          walls and label carry the silhouette) */}
      <primitive object={decor} visible={!dimmed} />

      {/* per-room candle-pool: lower + tighter falloff gives a bright pool with
          a dark edge instead of a flat fill. Only the best-lit rooms keep the
          light VISIBLE (budget + fog culling) — three re-counts lights and
          skips the room's shading cost entirely when it is off. */}
      <pointLight
        visible={lightOn && !dimmed}
        position={[0, WALL_H * 0.55, 0]}
        color={theme.accent}
        intensity={theme.accentIntensity * 20 * litFactor}
        distance={TILE * 1.9}
        decay={2.2}
      />

      <Html position={[0, WALL_H + 0.4, 0]} center distanceFactor={24} occlude={false}>
        <div className={`room-label ${highlighted ? "lit" : ""}`}>
          {def.name}
          {def.aura ? (def.aura > 0 ? " ✦" : " ☓") : ""}
        </div>
      </Html>
    </group>
  );
}
