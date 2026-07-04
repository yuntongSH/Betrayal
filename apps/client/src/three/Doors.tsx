import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  DIR_DELTA,
  DIRECTIONS,
  barricadeId,
  neighborKey,
  opposite,
  placedDoorways,
  type GameState,
} from "@dread-hollow/shared";
import { useStore } from "../state/store";
import { useBeats } from "../state/beats";
import { ambient } from "../audio/ambient";
import { FLOOR_Y, TILE, WALL_H } from "./layout";
import { registerWall, unregisterWall } from "./followCam";

const HALF = TILE / 2;
const DOOR_MAX_SWING = Math.PI * 0.56;

interface DoorDesc {
  id: string;
  position: [number, number, number];
  rotated: boolean; // east/west boundary: opening runs along z
}

interface DoorState {
  pivot: THREE.Group | null;
  open: number;
  openTarget: number;
  closeAt: number;
}

/** Every boundary where two placed rooms each have a matching doorway — a real
 *  passage that earns a door. Doorways onto the unexplored stay open gaps. */
function doorDescriptors(house: GameState["house"]): DoorDesc[] {
  const seen = new Set<string>();
  const out: DoorDesc[] = [];
  for (const room of Object.values(house)) {
    const doors = placedDoorways(room);
    for (const d of DIRECTIONS) {
      if (!doors.has(d)) continue;
      const nKey = neighborKey(room.floor, room.x, room.y, d);
      const neighbor = house[nKey];
      if (!neighbor) continue; // opens onto the unknown — leave the gap + arrow
      if (!placedDoorways(neighbor).has(opposite(d))) continue; // walls don't meet
      const id = barricadeId(room.key, nKey);
      if (seen.has(id)) continue;
      seen.add(id);
      const { dx, dy } = DIR_DELTA[d];
      out.push({
        id,
        position: [room.x * TILE + dx * HALF, FLOOR_Y[room.floor], room.y * TILE + dy * HALF],
        rotated: d === "east" || d === "west",
      });
    }
  }
  return out;
}

function Door({ desc, state }: { desc: DoorDesc; state: DoorState }) {
  const DW = 2.4; // door opening width — absolute: doors stay human-scale in the 7-unit rooms
  const DHt = 2.6; // door height — grand but human, leaves a real header under the 3.2 wall
  const WT = 0.22; // dividing-wall thickness
  const LT = 0.12; // leaf thickness
  const stubW = HALF - DW / 2;
  const leafW = DW - 0.05;
  const leafH = DHt - 0.05;

  // The stubs + header register with the x-ray system: when the chase camera
  // swings behind a walker mid-doorway, these boundary pieces are exactly what
  // hides them. Empty roomKey + zero normal make the facing pass a no-op; the
  // world boxes are computed once (doors are static). Jambs and the swinging
  // leaf stay solid — the leaf already opens on crossing.
  const xrayMeshes = useRef(new Set<THREE.Mesh>());
  useEffect(() => {
    const meshes = xrayMeshes.current;
    return () => {
      for (const m of meshes) unregisterWall(m);
      meshes.clear();
    };
  }, []);
  const xrayRef =
    (local: [number, number, number], size: [number, number, number]) =>
    (m: THREE.Mesh | null) => {
      if (!m) return;
      if (!m.userData.xray) {
        const [px, py, pz] = desc.position;
        const [lx, ly, lz] = local;
        const [sw, sh, sd] = size;
        // rotation.y = π/2 maps local (x, z) → world (z, -x); the 90° AABB is exact
        m.userData.xray = {
          until: 0,
          roomKey: "",
          normal: new THREE.Vector3(0, 0, 0),
          box: new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(
              px + (desc.rotated ? lz : lx),
              py + ly,
              pz + (desc.rotated ? -lx : lz)
            ),
            new THREE.Vector3(desc.rotated ? sd : sw, sh, desc.rotated ? sw : sd)
          ),
        };
      }
      // Set-backed, so re-running on every render is harmless.
      xrayMeshes.current.add(m);
      registerWall(m);
    };

  return (
    <group position={desc.position} rotation={[0, desc.rotated ? Math.PI / 2 : 0, 0]}>
      {/* dividing-wall stubs either side of the opening — each fadeable */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`stub${sx}`}
          position={[sx * (DW / 2 + stubW / 2), WALL_H / 2, 0]}
          castShadow
          receiveShadow
          ref={xrayRef([sx * (DW / 2 + stubW / 2), WALL_H / 2, 0], [stubW, WALL_H, WT])}
        >
          <boxGeometry args={[stubW, WALL_H, WT]} />
          <meshStandardMaterial color="#241b14" roughness={1} />
        </mesh>
      ))}
      {/* header above the door — fadeable like the stubs */}
      <mesh
        position={[0, (DHt + WALL_H) / 2, 0]}
        castShadow
        receiveShadow
        ref={xrayRef([0, (DHt + WALL_H) / 2, 0], [DW, WALL_H - DHt, WT])}
      >
        <boxGeometry args={[DW, WALL_H - DHt, WT]} />
        <meshStandardMaterial color="#241b14" roughness={1} />
      </mesh>
      {/* jambs frame the opening */}
      {[-1, 1].map((sx) => (
        <mesh key={`jamb${sx}`} position={[sx * (DW / 2), DHt / 2, 0]} castShadow>
          <boxGeometry args={[0.1, DHt + 0.06, WT + 0.06]} />
          <meshStandardMaterial color="#2c2016" roughness={0.95} />
        </mesh>
      ))}
      {/* hinged leaf — the pivot swings on its useFrame-driven rotation.y */}
      <group
        ref={(g) => {
          state.pivot = g;
        }}
        position={[-(DW / 2) + 0.02, 0, 0]}
      >
        <mesh position={[leafW / 2, leafH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[leafW, leafH, LT]} />
          <meshStandardMaterial color="#4a3422" roughness={0.82} metalness={0.04} />
        </mesh>
        {[0.28, 0.68].map((py) => (
          <mesh key={py} position={[leafW / 2, leafH * py, LT / 2]}>
            <boxGeometry args={[leafW * 0.6, leafH * 0.26, 0.03]} />
            <meshStandardMaterial color="#3a2818" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[leafW - 0.18, leafH * 0.5, LT / 2 + 0.03]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color="#c8a23a" metalness={0.75} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/** All the manor's doors: built at real passages, swung open as figures cross. */
export function Doors() {
  const game = useStore((s) => s.game)!;
  const descs = useMemo(() => doorDescriptors(game.house), [game.house]);

  // Persistent per-door animation state, keyed by boundary id.
  const states = useRef<Map<string, DoorState>>(new Map());
  for (const d of descs) {
    if (!states.current.has(d.id)) {
      states.current.set(d.id, { pivot: null, open: 0, openTarget: 0, closeAt: 0 });
    }
  }

  // Detect a figure crossing a boundary and pulse that door open.
  const prevPos = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const now = performance.now();
    const cur = new Map<string, string>();
    for (const p of game.players) if (p.alive && p.position) cur.set(p.id, p.position);
    for (const m of game.haunt?.monsters ?? []) if (m.hp > 0 && m.position) cur.set(`m:${m.id}`, m.position);
    for (const [id, key] of cur) {
      const prev = prevPos.current.get(id);
      if (prev && prev !== key) {
        const st = states.current.get(barricadeId(prev, key));
        if (st) {
          st.openTarget = 1;
          st.closeAt = now + 1500;
          ambient.doorCreak();
        }
      }
    }
    prevPos.current = cur;
  }, [game]);

  useFrame((_, delta) => {
    if (useBeats.getState().worldFrozen) return; // hold every leaf mid-swing
    const now = performance.now();
    const k = 1 - Math.exp(-7 * Math.min(0.05, delta));
    for (const st of states.current.values()) {
      if (st.openTarget === 1 && now > st.closeAt) st.openTarget = 0;
      st.open += (st.openTarget - st.open) * k;
      if (st.pivot) st.pivot.rotation.y = -st.open * DOOR_MAX_SWING;
    }
  });

  return (
    <group>
      {descs.map((d) => (
        <Door key={d.id} desc={d} state={states.current.get(d.id)!} />
      ))}
    </group>
  );
}
