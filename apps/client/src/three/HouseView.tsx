import { useMemo } from "react";
import { Html } from "@react-three/drei";
import {
  CHARACTERS_BY_ID,
  DIR_DELTA,
  ROOMS_BY_ID,
  connections,
  legalMoves,
  type Direction,
  type GameState,
} from "@dread-hollow/shared";
import { useStore } from "../state/store";
import { RoomTile } from "./RoomTile";
import { Doors } from "./Doors";
import { PlayerToken } from "./PlayerToken";
import { MonsterToken } from "./MonsterToken";
import { TILE, occupantsAt, ringOffset, roomWorld } from "./layout";

const HALF = TILE / 2;

/** Fog-of-war: BFS depth from the nearest living explorer to each room. */
function visibilityLevels(game: GameState): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier: string[] = [];
  for (const p of game.players) {
    if (p.alive && p.position && game.house[p.position] && !dist.has(p.position)) {
      dist.set(p.position, 0);
      frontier.push(p.position);
    }
  }
  let d = 0;
  while (frontier.length && d < 6) {
    const next: string[] = [];
    for (const k of frontier)
      for (const nb of connections(game, k)) {
        if (!dist.has(nb)) {
          dist.set(nb, d + 1);
          next.push(nb);
        }
      }
    frontier = next;
    d++;
  }
  return dist;
}

/** Candle brightness for a room at BFS depth `d` from the nearest explorer. */
export function litFactorFor(d: number | undefined): number {
  if (d == null) return 0.1;
  if (d <= 0) return 1.0;
  if (d === 1) return 0.72;
  if (d === 2) return 0.42;
  if (d === 3) return 0.26;
  return 0.16;
}

function DoorMarker({
  base,
  dir,
  onClick,
}: {
  base: [number, number, number];
  dir: Direction;
  onClick: () => void;
}) {
  const { dx, dy } = DIR_DELTA[dir];
  const pos: [number, number, number] = [
    base[0] + dx * (HALF + 0.4),
    base[1] + 0.9,
    base[2] + dy * (HALF + 0.4),
  ];
  const rot: [number, number, number] =
    dir === "north"
      ? [-Math.PI / 2, 0, 0]
      : dir === "south"
        ? [Math.PI / 2, 0, 0]
        : dir === "east"
          ? [0, 0, -Math.PI / 2]
          : [0, 0, Math.PI / 2];

  return (
    <group
      position={pos}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <mesh rotation={rot}>
        <coneGeometry args={[0.3, 0.7, 4]} />
        <meshStandardMaterial color="#e8a85a" emissive="#e8a85a" emissiveIntensity={1.2} />
      </mesh>
      <pointLight color="#e8a85a" intensity={3} distance={2.5} />
    </group>
  );
}

export function HouseView() {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.playerId);
  const moveTo = useStore((s) => s.moveTo);
  const explore = useStore((s) => s.explore);
  const attackMonster = useStore((s) => s.attackMonster);

  const legal = useMemo(
    () => (myId ? legalMoves(game, myId) : null),
    [game, myId],
  );
  const highlightSet = useMemo(
    () => new Set(legal?.explored ?? []),
    [legal],
  );
  const attackable = useMemo(
    () => new Set(legal?.attackMonsters ?? []),
    [legal],
  );
  const visibility = useMemo(() => visibilityLevels(game), [game]);

  const me = game.players.find((p) => p.id === myId);
  const myRoom = me?.position ? game.house[me.position] : undefined;

  return (
    <group>
      {Object.values(game.house).map((room) => {
        const def = ROOMS_BY_ID[room.roomId];
        if (!def) return null;
        return (
          <RoomTile
            key={room.key}
            room={room}
            def={def}
            highlighted={highlightSet.has(room.key)}
            litFactor={litFactorFor(visibility.get(room.key))}
            onClick={() => highlightSet.has(room.key) && moveTo(room.key)}
          />
        );
      })}

      {/* doors at every real passage between two placed rooms */}
      <Doors />

      {/* explore arrows around the active player's room */}
      {myRoom &&
        legal?.doors.map((dir) => (
          <DoorMarker
            key={dir}
            base={roomWorld(myRoom)}
            dir={dir}
            onClick={() => explore(dir)}
          />
        ))}

      {/* player + monster tokens, spread within shared rooms */}
      {Object.keys(game.house).map((key) => {
        const occ = occupantsAt(game, key);
        const room = game.house[key]!;
        const [wx, wy, wz] = roomWorld(room);
        return occ.map((o, i) => {
          const [ox, oz] = ringOffset(i, occ.length, 1.1);
          if (o.kind === "player") {
            const p = game.players.find((pp) => pp.id === o.id)!;
            const char = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
            return (
              <PlayerToken
                key={o.id}
                position={[wx + ox, wy, wz + oz]}
                color={char?.color ?? "#aaaaaa"}
                archetype={p.characterId ?? undefined}
                name={p.name}
                isActive={game.activePlayerId === p.id}
                isMe={p.id === myId}
                side={p.side}
                alive={p.alive}
              />
            );
          }
          const m = game.haunt?.monsters.find((mm) => mm.id === o.id);
          if (!m) return null;
          return (
            <MonsterToken
              key={o.id}
              position={[wx + ox, wy, wz + oz]}
              name={m.name}
              hp={m.hp}
              attackable={attackable.has(m.id)}
              mental={m.attackType === "mental"}
              onClick={() => attackMonster(m.id)}
            />
          );
        });
      })}

      {/* faint message before the house exists */}
      {Object.keys(game.house).length === 0 && (
        <Html center>
          <div className="muted">The house has not yet taken shape…</div>
        </Html>
      )}
    </group>
  );
}
