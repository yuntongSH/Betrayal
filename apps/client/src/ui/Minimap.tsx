import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHARACTERS_BY_ID,
  DIRECTIONS,
  DIR_DELTA,
  FLOORS,
  ROOMS_BY_ID,
  legalMoves,
  parseKey,
  placedDoorways,
  type Floor,
  type GameState,
  type PlacedRoom,
} from "@dread-hollow/shared";
import { roomTheme } from "@dread-hollow/decor";
import { useStore } from "../state/store";

/** Logical canvas size (CSS px); the backing store is scaled by devicePixelRatio. */
const MAP_W = 216;
const MAP_H = 176;
const MAP_PAD = 12;
const MAX_CELL = 34;

const FLOOR_TAB: Record<Floor, string> = { basement: "B", ground: "G", upper: "U" };
const FLOOR_TITLE: Record<Floor, string> = { basement: "Basement", ground: "Ground floor", upper: "Upper floor" };

/** Grid → canvas mapping of the last draw (for click/hover hit-testing). */
interface MapView {
  cell: number;
  ox: number;
  oy: number;
}

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

/** Mix a hex color toward another (0..1), returning a CSS color. */
function mixHex(a: number, b: number, t: number): string {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Small ring offsets so several occupant dots in one room never overlap. */
function dotOffset(i: number, count: number, r: number): [number, number] {
  if (count <= 1) return [0, 0];
  const a = (i / count) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  floor: Floor,
  myId: string | null,
  reach: ReadonlySet<string>,
  view: MapView,
): void {
  ctx.clearRect(0, 0, MAP_W, MAP_H);

  const rooms = Object.values(game.house).filter((r) => r.floor === floor);
  if (rooms.length === 0) {
    ctx.fillStyle = "rgba(138,128,118,.75)";
    ctx.font = "italic 11px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("nothing discovered here yet", MAP_W / 2, MAP_H / 2);
    view.cell = 0;
    return;
  }

  // Auto-fit: center the discovered bounds with padding, north (−y) up.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rooms) {
    if (r.x < minX) minX = r.x;
    if (r.x > maxX) maxX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.y > maxY) maxY = r.y;
  }
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;
  const cell = Math.min(MAX_CELL, (MAP_W - MAP_PAD * 2) / spanX, (MAP_H - MAP_PAD * 2) / spanY);
  const ox = (MAP_W - spanX * cell) / 2 - minX * cell;
  const oy = (MAP_H - spanY * cell) / 2 - minY * cell;
  view.cell = cell;
  view.ox = ox;
  view.oy = oy;

  const inset = cell * 0.1;
  const gap = cell * 0.34; // doorway opening in an edge
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const room of rooms) {
    const def = ROOMS_BY_ID[room.roomId];
    const theme = roomTheme(room.roomId);
    const reachable = reach.has(room.key);
    const x0 = ox + room.x * cell + inset;
    const y0 = oy + room.y * cell + inset;
    const s = cell - inset * 2;

    // Fill: the room's theme color lifted toward parchment; reachable rooms
    // glow brighter (they mirror the lit 3D tiles you can click).
    ctx.fillStyle = reachable
      ? mixHex(theme.floor, 0xe8a85a, 0.5)
      : mixHex(theme.floor, 0xd8cfc4, 0.22);
    roundedRect(ctx, x0, y0, s, s, Math.max(2, cell * 0.12));
    ctx.fill();
    if (reachable) {
      ctx.strokeStyle = "#e8a85a";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Edges: solid where walls are, notched open where the tile has a doorway.
    const doors = placedDoorways(room);
    ctx.strokeStyle = reachable ? "#f0cf9a" : hexColor(theme.wall);
    ctx.lineWidth = Math.max(1, cell * 0.06);
    ctx.lineCap = "round";
    for (const dir of DIRECTIONS) {
      const { dx, dy } = DIR_DELTA[dir];
      // Edge endpoints in room-local space (north = top).
      const horizontal = dy !== 0;
      const ex = dx === 1 ? x0 + s : x0; // east edge at right, west at left
      const ey = dy === 1 ? y0 + s : y0; // south edge at bottom, north at top
      ctx.beginPath();
      if (horizontal) {
        if (doors.has(dir)) {
          ctx.moveTo(x0, ey);
          ctx.lineTo(x0 + (s - gap) / 2, ey);
          ctx.moveTo(x0 + (s + gap) / 2, ey);
          ctx.lineTo(x0 + s, ey);
        } else {
          ctx.moveTo(x0, ey);
          ctx.lineTo(x0 + s, ey);
        }
      } else {
        if (doors.has(dir)) {
          ctx.moveTo(ex, y0);
          ctx.lineTo(ex, y0 + (s - gap) / 2);
          ctx.moveTo(ex, y0 + (s + gap) / 2);
          ctx.lineTo(ex, y0 + s);
        } else {
          ctx.moveTo(ex, y0);
          ctx.lineTo(ex, y0 + s);
        }
      }
      ctx.stroke();
    }

    // Markers: aura in the top-left, stairs/elevator glyph in the bottom-right.
    const glyphPx = Math.max(8, cell * 0.34);
    ctx.font = `${glyphPx}px Georgia, serif`;
    if (def?.aura && def.aura > 0) {
      ctx.fillStyle = "#e2c15a";
      ctx.fillText("✦", x0 + glyphPx * 0.45, y0 + glyphPx * 0.5);
    } else if (def?.aura && def.aura < 0) {
      ctx.fillStyle = "#c2412f";
      ctx.fillText("☓", x0 + glyphPx * 0.45, y0 + glyphPx * 0.5);
    }
    const special = def?.special;
    const stairsGlyph =
      special === "mystic-elevator"
        ? "⇅"
        : special === "grand-staircase" || special === "stairs-up" || special === "stairs-down"
          ? "⇗"
          : null;
    if (stairsGlyph) {
      ctx.fillStyle = "#cdbfa8";
      ctx.fillText(stairsGlyph, x0 + s - glyphPx * 0.45, y0 + s - glyphPx * 0.5);
    }
  }

  // Occupants: identity-colored player dots (the watched player ringed) and
  // red monster dots, spread on a small ring when a room is crowded.
  const dotR = Math.max(2.4, cell * 0.11);
  const byRoom = new Map<string, Array<{ color: string; ring: boolean }>>();
  for (const p of game.players) {
    if (!p.alive || !p.position) continue;
    const placed = game.house[p.position];
    if (!placed || placed.floor !== floor) continue;
    const char = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
    const list = byRoom.get(p.position) ?? [];
    list.push({ color: char?.color ?? "#aaaaaa", ring: p.id === myId });
    byRoom.set(p.position, list);
  }
  for (const m of game.haunt?.monsters ?? []) {
    if (!m.position || m.hp <= 0) continue;
    const placed = game.house[m.position];
    if (!placed || placed.floor !== floor) continue;
    const list = byRoom.get(m.position) ?? [];
    list.push({ color: "#c2412f", ring: false });
    byRoom.set(m.position, list);
  }
  for (const [key, dots] of byRoom) {
    const { x, y } = parseKey(key);
    const cx = ox + (x + 0.5) * cell;
    const cy = oy + (y + 0.5) * cell;
    dots.forEach((d, i) => {
      const [dxp, dyp] = dotOffset(i, dots.length, dotR * 1.6);
      ctx.beginPath();
      ctx.arc(cx + dxp, cy + dyp, dotR, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,.7)";
      ctx.stroke();
      if (d.ring) {
        ctx.beginPath();
        ctx.arc(cx + dxp, cy + dyp, dotR + 2, 0, Math.PI * 2);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = "#f4e7dd";
        ctx.stroke();
      }
    });
  }
}

/**
 * Bird's-eye minimap of the discovered house, bottom-right. Shows the watched
 * player's floor (tabs switch manually; a floor change follows automatically),
 * walls/doorways per tile, aura and stairs markers, and every occupant. On
 * your turn, clicking a reachable (brightened) room dispatches the exact same
 * `moveTo` the lit 3D tile does. Redraws only when the game state changes.
 */
export function Minimap() {
  const game = useStore((s) => s.game);
  const myId = useStore((s) => s.playerId);
  const moveTo = useStore((s) => s.moveTo);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<MapView>({ cell: 0, ox: 0, oy: 0 });
  const [floor, setFloor] = useState<Floor>("ground");
  const [hover, setHover] = useState<{ name: string; reachable: boolean } | null>(null);

  // Auto-follow the watched player across floors (manual tab choice holds
  // until they climb or descend again).
  const me = game?.players.find((p) => p.id === myId);
  const myFloor = me?.position && game?.house[me.position] ? game.house[me.position]!.floor : null;
  useEffect(() => {
    if (myFloor) setFloor(myFloor);
  }, [myFloor]);

  // Same source of truth as the lit 3D tiles: legalMoves' explored list
  // (empty when it isn't your turn, so off-turn clicks are naturally no-ops).
  const reach = useMemo(
    () => new Set(game && myId ? legalMoves(game, myId).explored : []),
    [game, myId],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !game) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(MAP_W * dpr);
    canvas.height = Math.round(MAP_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(ctx, game, floor, myId, reach, view.current);
  }, [game, floor, myId, reach]);

  if (!game) return null;

  /** Map a pointer event to the room key under the cursor (or null). */
  const roomAt = (e: React.MouseEvent<HTMLCanvasElement>): string | null => {
    const { cell, ox, oy } = view.current;
    if (cell <= 0) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) * MAP_W) / rect.width;
    const ly = ((e.clientY - rect.top) * MAP_H) / rect.height;
    const gx = Math.floor((lx - ox) / cell);
    const gy = Math.floor((ly - oy) / cell);
    const key = `${floor}:${gx}:${gy}`;
    return game.house[key] ? key : null;
  };

  return (
    <div className="minimap" title={FLOOR_TITLE[floor]}>
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        style={{ cursor: hover?.reachable ? "pointer" : "default" }}
        onClick={(e) => {
          const key = roomAt(e);
          if (key && reach.has(key)) moveTo(key); // same action as the lit 3D room
        }}
        onMouseMove={(e) => {
          const key = roomAt(e);
          const def = key ? ROOMS_BY_ID[game.house[key]!.roomId] : undefined;
          const next = def ? { name: def.name, reachable: reach.has(key!) } : null;
          setHover((h) =>
            h?.name === next?.name && h?.reachable === next?.reachable ? h : next,
          );
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hover && (
        <div className={`minimap-tip${hover.reachable ? " walk" : ""}`}>
          {hover.name}
          {hover.reachable ? " — click to walk" : ""}
        </div>
      )}
      <div className="minimap-floors">
        {FLOORS.map((f) => (
          <button
            key={f}
            className={`minimap-floor${f === floor ? " sel" : ""}`}
            title={FLOOR_TITLE[f]}
            onClick={() => setFloor(f)}
          >
            {FLOOR_TAB[f]}
          </button>
        ))}
      </div>
    </div>
  );
}
