import { describe, expect, it } from "vitest";
import { reduce } from "../engine";
import { connections } from "../house";
import { createGame, ENTRANCE_KEY } from "../setup";
import { getPlayer, roomAura } from "../state";
import { key } from "../grid";
import type { GameState, PlacedRoom } from "../types";

function startedGame(seed = 5): GameState {
  const s = createGame("test", seed);
  reduce(s, { type: "join", playerId: "a", name: "Alice" });
  reduce(s, { type: "join", playerId: "b", name: "Bob" });
  reduce(s, { type: "join", playerId: "c", name: "Cara" });
  reduce(s, { type: "choose-character", playerId: "a", characterId: "vance" });
  reduce(s, { type: "choose-character", playerId: "b", characterId: "crow" });
  reduce(s, { type: "choose-character", playerId: "c", characterId: "penny" });
  reduce(s, { type: "start-game", playerId: "a" });
  return s;
}

function place(s: GameState, roomId: string, k: string): void {
  const { floor, x, y } = {
    floor: k.split(":")[0] as PlacedRoom["floor"],
    x: Number(k.split(":")[1]),
    y: Number(k.split(":")[2]),
  };
  s.house[k] = { key: k, roomId, floor, x, y, rotation: 0, exploredBy: null };
}

describe("Mystic Elevator vertical movement", () => {
  it("links the elevator to every other floor's landing — and back", () => {
    const s = startedGame();
    // Start tiles give us a landing hub on all three floors.
    expect(s.house[key("ground", 0, 0)]).toBeDefined();
    expect(s.house[key("upper", 0, 0)]).toBeDefined();
    expect(s.house[key("basement", 0, 0)]).toBeDefined();

    const elevatorKey = key("ground", 5, 5);
    place(s, "mystic-elevator", elevatorKey);

    const fromElevator = connections(s, elevatorKey);
    // Rides to other floors' landings, but not its own floor's hub.
    expect(fromElevator).toContain(key("upper", 0, 0));
    expect(fromElevator).toContain(key("basement", 0, 0));
    expect(fromElevator).not.toContain(key("ground", 0, 0));

    // A landing on another floor can call the elevator back.
    expect(connections(s, key("upper", 0, 0))).toContain(elevatorKey);
    // The elevator's own floor landing does not (use the stairs/doors instead).
    expect(connections(s, key("ground", 0, 0))).not.toContain(elevatorKey);
  });

  it("returns no duplicate destinations", () => {
    const s = startedGame();
    const elevatorKey = key("upper", 3, 3);
    place(s, "mystic-elevator", elevatorKey);
    const conns = connections(s, elevatorKey);
    expect(conns.length).toBe(new Set(conns).size);
  });
});

describe("in-room dice auras", () => {
  it("reports the standing modifier of the occupied room", () => {
    const s = startedGame();
    const p = getPlayer(s, "a")!;
    place(s, "chapel", key("ground", 2, 2)); // consecrated: +1
    place(s, "crypt", key("basement", 2, 2)); // dread: -1

    p.position = key("ground", 2, 2);
    expect(roomAura(s, p)).toBe(1);
    p.position = key("basement", 2, 2);
    expect(roomAura(s, p)).toBe(-1);
    p.position = ENTRANCE_KEY; // no aura
    expect(roomAura(s, p)).toBe(0);
    p.position = null;
    expect(roomAura(s, p)).toBe(0);
  });
});
