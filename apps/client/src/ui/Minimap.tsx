import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CHARACTERS_BY_ID,
  DIRECTIONS,
  DIR_DELTA,
  FLOORS,
  ROOMS_BY_ID,
  connections,
  legalMoves,
  parseKey,
  placedDoorways,
  type Direction,
  type Floor,
  type GameState,
  type PlacedRoom,
} from "@dread-hollow/shared";
import { roomTheme } from "@dread-hollow/decor";
import { useStore } from "../state/store";
import { useView } from "../state/view";
import { fpLook } from "../three/FirstPersonRig";

/** Logical canvas size (CSS px); the backing store is scaled by devicePixelRatio. */
const MAP_W = 264;
const MAP_H = 216;
const MAP_PAD = 12;
const MAX_CELL = 34;

const FLOOR_TAB: Record<Floor, string> = { basement: "B", ground: "G", upper: "U" };
const FLOOR_TITLE: Record<Floor, string> = { basement: "Basement", ground: "Ground floor", upper: "Upper floor" };

const ROOM_INK = 0x1d1826; // discovered-room fill (theme tint stays a whisper)

/** Grid → canvas mapping of the last draw (for click/hover hit-testing). */
interface MapView {
  cell: number;
  ox: number;
  oy: number;
}

/** A clickable explore pip: the flame arrow at one of MY room's unexplored
 *  doorways, in canvas coordinates. */
interface ExplorePip {
  dir: Direction;
  x: number;
  y: number;
  r: number;
}

/** Locate-flash pub/sub: the roster calls `flashOnMap`, the mounted map jumps
 *  to that player's floor and pulses a ring over their dot. Module-scoped like
 *  three/director.ts so no store churn is needed. */
const flashListeners = new Set<(playerId: string) => void>();

export function flashOnMap(playerId: string): void {
  for (const fn of flashListeners) fn(playerId);
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

/** Compass in the canvas's top-left: ↑ key = north = map-up. */
function drawCompass(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "rgba(216,207,196,.4)";
  ctx.fillStyle = "rgba(216,207,196,.5)";
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(10, 15);
  ctx.lineTo(10, 6);
  ctx.moveTo(7, 9);
  ctx.lineTo(10, 6);
  ctx.lineTo(13, 9);
  ctx.stroke();
  ctx.font = "bold 9px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 10, 22);
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  floor: Floor,
  myId: string | null,
  reach: ReadonlySet<string>,
  exploreDoors: ReadonlySet<Direction>,
  view: MapView,
  dotAt: Map<string, { x: number; y: number }>,
  pips: ExplorePip[],
): void {
  ctx.clearRect(0, 0, MAP_W, MAP_H);
  drawCompass(ctx);

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

  const myKey = game.players.find((p) => p.id === myId)?.position ?? null;
  const inset = cell * 0.1;
  const gap = cell * 0.4; // doorway opening in an edge
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const room of rooms) {
    const def = ROOMS_BY_ID[room.roomId];
    const theme = roomTheme(room.roomId);
    const reachable = reach.has(room.key);
    const x0 = ox + room.x * cell + inset;
    const y0 = oy + room.y * cell + inset;
    const s = cell - inset * 2;

    // Fill: near-black room ink with at most a whisper of the room's theme
    // (legibility beats variety); reachable rooms alone get the amber wash
    // that mirrors the lit 3D tiles you can click.
    ctx.fillStyle = mixHex(ROOM_INK, theme.floor, 0.08);
    roundedRect(ctx, x0, y0, s, s, Math.max(2, cell * 0.12));
    ctx.fill();
    if (reachable) {
      ctx.fillStyle = "rgba(232,168,90,.28)";
      ctx.fill();
    }

    // Edges: bone walls, notched open where the tile has a WORKING doorway.
    // A door facing a discovered neighbor's blank wall is sealed for the rest
    // of the night, so it draws solid: the map must answer "can I walk there?"
    // not "does my tile have a door printed on it?". Reachable rooms stroke
    // amber under a soft glow — shadow is reset right after so nothing blurs.
    const doors = placedDoorways(room);
    const linked = new Set(connections(game, room.key));
    if (reachable) {
      ctx.strokeStyle = "#e8a85a";
      ctx.shadowColor = "#e8a85a";
      ctx.shadowBlur = 6;
    } else {
      ctx.strokeStyle = "rgba(216,207,196,.85)";
    }
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const dir of DIRECTIONS) {
      const { dx, dy } = DIR_DELTA[dir];
      const nKey = `${room.floor}:${room.x + dx}:${room.y + dy}`;
      const neighbor = game.house[nKey];
      // Open = my door leads somewhere: an undiscovered doorway (explorable)
      // or a live passage. Discovered neighbor without the matching door (or
      // a barricade) draws as the wall it effectively is.
      const open = doors.has(dir) && (!neighbor || linked.has(nKey));
      // Edge endpoints in room-local space (north = top).
      const horizontal = dy !== 0;
      const ex = dx === 1 ? x0 + s : x0; // east edge at right, west at left
      const ey = dy === 1 ? y0 + s : y0; // south edge at bottom, north at top
      ctx.beginPath();
      if (horizontal) {
        if (open) {
          ctx.moveTo(x0, ey);
          ctx.lineTo(x0 + (s - gap) / 2, ey);
          ctx.moveTo(x0 + (s + gap) / 2, ey);
          ctx.lineTo(x0 + s, ey);
        } else {
          ctx.moveTo(x0, ey);
          ctx.lineTo(x0 + s, ey);
        }
      } else {
        if (open) {
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
    ctx.shadowBlur = 0;

    // Passage ticks: a short bar across the gutter wherever you can actually
    // walk between two discovered rooms — the map's answer to "are these two
    // connected, or just touching?". Drawn once per pair (east/south only).
    ctx.strokeStyle = "rgba(216,207,196,.55)";
    ctx.lineWidth = Math.max(2, cell * 0.1);
    for (const dir of ["east", "south"] as const) {
      const { dx, dy } = DIR_DELTA[dir];
      const nKey = `${room.floor}:${room.x + dx}:${room.y + dy}`;
      if (!game.house[nKey] || !linked.has(nKey)) continue;
      const cx = ox + (room.x + 0.5 + dx * 0.5) * cell;
      const cy = oy + (room.y + 0.5 + dy * 0.5) * cell;
      const half = inset * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - dx * half, cy - dy * half);
      ctx.lineTo(cx + dx * half, cy + dy * half);
      ctx.stroke();
    }

    // The watched player's current room gets an extra bone ring so "where am
    // I" has a room-level answer before you even spot your pin.
    if (room.key === myKey) {
      ctx.strokeStyle = "rgba(233,223,204,.95)";
      ctx.lineWidth = 2.5;
      roundedRect(ctx, x0 - 1.5, y0 - 1.5, s + 3, s + 3, Math.max(3, cell * 0.14));
      ctx.stroke();

      // Explore pips: a flame arrow just OUTSIDE each doorway that leads into
      // the undiscovered dark — the map twin of the 3D flame arrows, and
      // clickable the same way. (Turn-gated: exploreDoors is empty otherwise.)
      for (const dir of exploreDoors) {
        const { dx, dy } = DIR_DELTA[dir];
        const px = ox + (room.x + 0.5 + dx * 0.62) * cell;
        const py = oy + (room.y + 0.5 + dy * 0.62) * cell;
        const r = Math.max(4, cell * 0.15);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2); // triangle points outward
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.85, r * 0.7);
        ctx.lineTo(-r * 0.85, r * 0.7);
        ctx.closePath();
        ctx.fillStyle = "#e8a85a";
        ctx.shadowColor = "#e8a85a";
        ctx.shadowBlur = 7;
        ctx.fill();
        ctx.restore();
        ctx.shadowBlur = 0;
        pips.push({ dir, x: px, y: py, r: r * 1.7 });
      }
    }

    // Markers: aura in the top-left, stairs/elevator glyph in the bottom-right.
    const glyphPx = Math.max(8, cell * 0.34);
    ctx.font = `${glyphPx}px Georgia, serif`;
    if (def?.aura && def.aura > 0) {
      ctx.fillStyle = "#ecc768";
      ctx.fillText("✦", x0 + glyphPx * 0.45, y0 + glyphPx * 0.5);
    } else if (def?.aura && def.aura < 0) {
      ctx.fillStyle = "#d4553f";
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
      ctx.fillStyle = "#d8cfc4";
      ctx.fillText(stairsGlyph, x0 + s - glyphPx * 0.45, y0 + s - glyphPx * 0.5);
    }
  }

  // Occupants: identity-colored player dots (initial lettered when the cell
  // is roomy) and red monster dots, spread on a small ring when crowded.
  // Player dot positions are reported back for the DOM you-pin/flash overlays.
  const dotR = Math.max(4.5, cell * 0.16);
  const byRoom = new Map<string, Array<{ id?: string; color: string; initial?: string }>>();
  for (const p of game.players) {
    if (!p.alive || !p.position) continue;
    const placed = game.house[p.position];
    if (!placed || placed.floor !== floor) continue;
    const char = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
    const list = byRoom.get(p.position) ?? [];
    list.push({ id: p.id, color: char?.color ?? "#aaaaaa", initial: char?.name.charAt(0) });
    byRoom.set(p.position, list);
  }
  for (const m of game.haunt?.monsters ?? []) {
    if (!m.position || m.hp <= 0) continue;
    const placed = game.house[m.position];
    if (!placed || placed.floor !== floor) continue;
    const list = byRoom.get(m.position) ?? [];
    list.push({ color: "#c2412f" });
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
      if (d.initial && cell >= 22) {
        ctx.fillStyle = "#14111c";
        ctx.font = "bold 9px Georgia, serif";
        ctx.fillText(d.initial, cx + dxp, cy + dyp + 0.5);
      }
      if (d.id) dotAt.set(d.id, { x: cx + dxp, y: cy + dyp });
    });
  }
}

/**
 * Bird's-eye minimap of the discovered house, bottom-right. The header names
 * the watched player's room and whose move it is; the canvas shows walls/
 * doorways per tile in the shared ink language, aura and stairs markers, and
 * every occupant (your dot carries a DOM pulsing pin). Floor tabs switch
 * manually (a floor change follows automatically) and carry per-floor
 * occupancy dots. On your turn, clicking a reachable (amber) room dispatches
 * the exact same `moveTo` the lit 3D tile does. Redraws only on state change.
 */
export function Minimap() {
  const game = useStore((s) => s.game);
  const myId = useStore((s) => s.playerId);
  const moveTo = useStore((s) => s.moveTo);
  const explore = useStore((s) => s.explore);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinRef = useRef<HTMLSpanElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const view = useRef<MapView>({ cell: 0, ox: 0, oy: 0 });
  const pips = useRef<ExplorePip[]>([]);
  const [floor, setFloor] = useState<Floor>("ground");
  const [hover, setHover] = useState<{ name: string; reachable: boolean } | null>(null);
  const [flash, setFlash] = useState<{ playerId: string; seq: number } | null>(null);
  const flashSeq = useRef(0);
  const fpDriving = useView((s) => s.driving);

  // Auto-follow the watched player across floors (manual tab choice holds
  // until they climb or descend again).
  const me = game?.players.find((p) => p.id === myId);
  const myFloor = me?.position && game?.house[me.position] ? game.house[me.position]!.floor : null;
  useEffect(() => {
    if (myFloor) setFloor(myFloor);
  }, [myFloor]);

  // Locate-flash: jump to the clicked player's floor, pulse a ring over their
  // dot for ~1.8s (keyed by seq so a repeat click restarts the animation).
  useEffect(() => {
    const onFlash = (playerId: string) => {
      if (!game) return;
      const p = game.players.find((pl) => pl.id === playerId);
      const placed = p?.position ? game.house[p.position] : undefined;
      if (placed) setFloor(placed.floor);
      setFlash({ playerId, seq: ++flashSeq.current });
    };
    flashListeners.add(onFlash);
    return () => void flashListeners.delete(onFlash);
  }, [game]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  // Same source of truth as the lit 3D tiles and flame arrows: legalMoves
  // (all empty when it isn't your turn, so off-turn clicks are no-ops).
  const legal = useMemo(() => (game && myId ? legalMoves(game, myId) : null), [game, myId]);
  const reach = useMemo(() => new Set(legal?.explored ?? []), [legal]);
  const doors = useMemo(() => new Set(legal?.doors ?? []), [legal]);

  // Per-floor occupancy (≤4 identity-colored dots per tab): "who is on which
  // floor" is answered without switching tabs.
  const tabDots = useMemo(() => {
    const dots: Record<Floor, string[]> = { basement: [], ground: [], upper: [] };
    for (const p of game?.players ?? []) {
      if (!p.alive || !p.position) continue;
      const placed = game!.house[p.position];
      if (!placed || dots[placed.floor].length >= 4) continue;
      const char = p.characterId ? CHARACTERS_BY_ID[p.characterId] : undefined;
      dots[placed.floor].push(char?.color ?? "#aaaaaa");
    }
    return dots;
  }, [game]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !game) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(MAP_W * dpr);
    canvas.height = Math.round(MAP_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dotAt = new Map<string, { x: number; y: number }>();
    pips.current = [];
    drawMap(ctx, game, floor, myId, reach, doors, view.current, dotAt, pips.current);

    // DOM overlays (you-pin + locate-flash) reuse the draw's grid→px mapping;
    // offsets are relative to .minimap (position:absolute → offsetParent).
    // Absent dots (other floor, dead) hide the element.
    const scale = canvas.clientWidth / MAP_W || 1;
    const dotR = Math.max(4.5, view.current.cell * 0.16);
    const place = (el: HTMLElement | null, id: string | null | undefined, pad: number) => {
      if (!el) return;
      const at = id ? dotAt.get(id) : undefined;
      if (!at) {
        el.style.display = "none";
        return;
      }
      const r = (dotR + pad) * scale;
      el.style.display = "";
      el.style.left = `${canvas.offsetLeft + at.x * scale - r}px`;
      el.style.top = `${canvas.offsetTop + at.y * scale - r}px`;
      el.style.width = `${r * 2}px`;
      el.style.height = `${r * 2}px`;
    };
    place(pinRef.current, myId, 3);
    place(flashRef.current, flash?.playerId, 6);
  }, [game, floor, myId, reach, doors, flash]);

  // First person: your pin grows a facing needle — "which way am I looking"
  // is THE navigation question when all you can see is one candle-lit room.
  // The look yaw changes per-frame without state churn, so a light rAF loop
  // rotates the pin's DOM transform directly (map-up is north = -Z = yaw 0).
  useEffect(() => {
    const pin = pinRef.current;
    if (!fpDriving || !pin) return;
    pin.classList.add("facing");
    let raf = 0;
    const spin = () => {
      pin.style.transform = `rotate(${(-fpLook.yaw * 180) / Math.PI}deg)`;
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => {
      cancelAnimationFrame(raf);
      pin.classList.remove("facing");
      pin.style.transform = "";
    };
  }, [fpDriving]);

  if (!game) return null;

  /** Pointer event → canvas-space coordinates of the last draw. */
  const canvasXY = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) * MAP_W) / rect.width,
      ((e.clientY - rect.top) * MAP_H) / rect.height,
    ];
  };

  /** Map a pointer event to the room key under the cursor (or null). */
  const roomAt = (e: React.MouseEvent<HTMLCanvasElement>): string | null => {
    const { cell, ox, oy } = view.current;
    if (cell <= 0) return null;
    const [lx, ly] = canvasXY(e);
    const gx = Math.floor((lx - ox) / cell);
    const gy = Math.floor((ly - oy) / cell);
    const key = `${floor}:${gx}:${gy}`;
    return game.house[key] ? key : null;
  };

  /** Map a pointer event to an explore pip under the cursor (or null). */
  const pipAt = (e: React.MouseEvent<HTMLCanvasElement>): ExplorePip | null => {
    const [lx, ly] = canvasXY(e);
    return pips.current.find((p) => Math.hypot(p.x - lx, p.y - ly) <= p.r) ?? null;
  };

  // Header strip: where the watched player stands, and whose move it is.
  const myRoom: PlacedRoom | undefined = me?.position ? game.house[me.position] : undefined;
  const myRoomName = myRoom ? ROOMS_BY_ID[myRoom.roomId]?.name ?? "…" : "…";
  const myChar = me?.characterId ? CHARACTERS_BY_ID[me.characterId] : undefined;
  const myTurn = game.activePlayerId === myId;
  const ended = game.phase === "ended";
  const activeName = game.players.find((p) => p.id === game.activePlayerId)?.name ?? "…";

  return (
    <div className="minimap" title={FLOOR_TITLE[floor]}>
      <div className="mm-here" title={myRoom ? `${myRoomName} · ${FLOOR_TITLE[myRoom.floor]}` : undefined}>
        ⌖ {myRoomName}
        {myRoom && <span className="mm-here-floor"> · {FLOOR_TITLE[myRoom.floor]}</span>}
      </div>
      <div className={`mm-turn${myTurn && !ended ? " yours" : ""}`}>
        {ended
          ? "concluded"
          : myTurn
            ? `Your move · ${game.movementLeft} step${game.movementLeft === 1 ? "" : "s"} left`
            : `${activeName} is exploring…`}
      </div>
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        style={{ cursor: hover?.reachable ? "pointer" : "default" }}
        onClick={(e) => {
          const pip = pipAt(e);
          if (pip) return explore(pip.dir); // the map twin of the flame arrow
          const key = roomAt(e);
          if (key && reach.has(key)) moveTo(key); // same action as the lit 3D room
        }}
        onMouseMove={(e) => {
          const pip = pipAt(e);
          const key = pip ? null : roomAt(e);
          const def = key ? ROOMS_BY_ID[game.house[key]!.roomId] : undefined;
          const next = pip
            ? { name: `Explore ${pip.dir}, into the unknown`, reachable: true }
            : def
              ? { name: def.name, reachable: reach.has(key!) }
              : null;
          setHover((h) =>
            h?.name === next?.name && h?.reachable === next?.reachable ? h : next,
          );
        }}
        onMouseLeave={() => setHover(null)}
      />
      {hover && (
        <div className={`minimap-tip${hover.reachable ? " walk" : ""}`}>
          {hover.name}
          {hover.reachable ? " · click to walk" : ""}
        </div>
      )}
      <span
        ref={pinRef}
        className="mm-you"
        style={{ display: "none", "--pc": myChar?.color ?? "#e8a85a" } as CSSProperties}
        aria-hidden="true"
      />
      {flash && (
        <span key={flash.seq} ref={flashRef} className="mm-flash" style={{ display: "none" }} aria-hidden="true" />
      )}
      <div className="minimap-floors">
        {FLOORS.map((f) => (
          <button
            key={f}
            className={`minimap-floor${f === floor ? " sel" : ""}`}
            title={FLOOR_TITLE[f]}
            onClick={() => setFloor(f)}
          >
            <span className="mm-tab-top">
              {FLOOR_TAB[f]}
              {/* cross-floor cue: your floor keeps a ⌖ when it isn't shown */}
              {myFloor === f && f !== floor && <span className="mm-tab-here">⌖</span>}
            </span>
            <span className="mm-tab-dots">
              {tabDots[f].map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
