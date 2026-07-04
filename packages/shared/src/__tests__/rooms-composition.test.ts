/**
 * Map-composition invariants — the deck must stay shaped like the official
 * board game's tile set so that all three floors can build out into full
 * boards. Official reference numbers (3rd ed. tile counts/floors/symbols,
 * 2nd ed. door distribution) are sourced in docs/MAP-GAP-ANALYSIS.md.
 *
 * If one of these fails after a content change, the map has regressed toward
 * the old "half-deck" that couldn't fill a floor — fix the content, not the
 * bounds (the bounds ARE the board game).
 */
import { describe, expect, it } from "vitest";
import { DRAWABLE_ROOMS, ROOMS, ROOMS_BY_ID, START_ROOMS } from "../content";
import { reduce } from "../engine";
import { openDoors } from "../house";
import { createGame } from "../setup";
import { FLOORS, type Floor, type GameState } from "../types";

function startedGame(seed = 7): GameState {
  const s = createGame("compo", seed);
  reduce(s, { type: "join", playerId: "a", name: "Alice" });
  reduce(s, { type: "join", playerId: "b", name: "Bob" });
  reduce(s, { type: "join", playerId: "c", name: "Cara" });
  reduce(s, { type: "choose-character", playerId: "a", characterId: "vance" });
  reduce(s, { type: "choose-character", playerId: "b", characterId: "crow" });
  reduce(s, { type: "choose-character", playerId: "c", characterId: "penny" });
  reduce(s, { type: "start-game", playerId: "a" });
  return s;
}

describe("room definitions are well-formed", () => {
  it("ids are unique and every room has at least one doorway and one floor", () => {
    const ids = new Set(ROOMS.map((r) => r.id));
    expect(ids.size).toBe(ROOMS.length);
    for (const r of ROOMS) {
      expect(r.doorways.length, `${r.id} needs a doorway`).toBeGreaterThan(0);
      expect(new Set(r.doorways).size, `${r.id} has duplicate doorways`).toBe(r.doorways.length);
      expect(r.floors.length, `${r.id} needs a floor`).toBeGreaterThan(0);
    }
  });

  it("every pre-composition room id still exists (frontends reference them)", () => {
    const legacy = [
      "entrance-hall", "foyer", "grand-staircase", "upper-landing", "basement-landing",
      "dusty-hallway", "creaking-corridor", "portrait-gallery", "abandoned-nursery",
      "servants-quarters", "larder", "cold-cellar", "boiler-room", "catacomb", "chapel",
      "conservatory", "study", "master-bedroom", "attic", "kitchen", "dining-room",
      "library", "crypt", "mystic-elevator", "gymnasium", "vault", "pentagram-chamber",
    ];
    for (const id of legacy) expect(ROOMS_BY_ID[id], `missing legacy room ${id}`).toBeDefined();
  });
});

describe("deck matches the official composition shape", () => {
  const drawable = DRAWABLE_ROOMS;

  it("deck is full-size: at least 42 drawable tiles (official 3rd ed. count)", () => {
    expect(drawable.length).toBeGreaterThanOrEqual(42);
  });

  it("per-floor availability covers a full board (official ≈ 23 G / 22 U / 19 B)", () => {
    const perFloor = (f: Floor) => drawable.filter((r) => r.floors.includes(f)).length;
    expect(perFloor("ground")).toBeGreaterThanOrEqual(23);
    expect(perFloor("upper")).toBeGreaterThanOrEqual(22);
    expect(perFloor("basement")).toBeGreaterThanOrEqual(19);
  });

  it("door distribution is at least as open as the official set", () => {
    const doors = drawable.map((r) => r.doorways.length);
    const total = doors.reduce((a, b) => a + b, 0);
    // official 2nd-ed. averages 2.24 doors/tile — never fall below the board game
    expect(total / doors.length).toBeGreaterThanOrEqual(2.24);
    // dead ends capped at the official ratio (11 of 42 ≈ 26%)
    const deadEnds = doors.filter((d) => d === 1).length;
    expect(deadEnds / doors.length).toBeLessThanOrEqual(11 / 42);
    // and at least the official share of big connective tiles (12 of 42 ≈ 29%)
    const connective = doors.filter((d) => d >= 3).length;
    expect(connective / doors.length).toBeGreaterThanOrEqual(12 / 42);
  });

  it("card-symbol mix stays near the official proportions", () => {
    const n = drawable.length;
    const count = (sym?: string) => drawable.filter((r) => r.symbol === sym).length;
    // official 3rd ed.: 15 event / 14 omen / 6 item / 7 blank of 42
    expect(count("event") / n).toBeGreaterThanOrEqual(0.3);
    expect(count("event") / n).toBeLessThanOrEqual(0.42);
    expect(count("omen") / n).toBeGreaterThanOrEqual(0.24);
    expect(count("omen") / n).toBeLessThanOrEqual(0.38);
    expect(count("item") / n).toBeGreaterThanOrEqual(0.12);
    expect(count("item") / n).toBeLessThanOrEqual(0.22);
    expect(count(undefined) / n).toBeLessThanOrEqual(0.25); // blanks don't crowd out draws
  });

  it("start tiles fan out like the official pre-placed tiles", () => {
    const doorCount = (id: string) => ROOMS_BY_ID[id]!.doorways.length;
    expect(doorCount("foyer")).toBe(4); // 4-door crossroads
    expect(doorCount("entrance-hall")).toBe(3); // 3 doorways (front door doesn't count)
    expect(doorCount("grand-staircase")).toBe(1); // stairs, one landing door
    expect(doorCount("upper-landing")).toBe(4); // official landings are 4-door hubs
    expect(doorCount("basement-landing")).toBe(4);
    expect(START_ROOMS).toHaveLength(5);
  });
});

describe("every floor can physically build out its entire legal tile set", () => {
  // Door-budget feasibility: placing a tile consumes one open doorway from the
  // floor's frontier and contributes (doors - 1) new ones. If, placing the
  // floor's whole legal set in the most favourable order (big tiles first, dead
  // ends last), the frontier never hits zero, then no floor can ever strand its
  // own tiles — the whole legal set fits on the board simultaneously.
  it("frontier never runs dry on any floor", () => {
    const s = startedGame();
    for (const floor of FLOORS) {
      let frontier = 0;
      for (const k in s.house) {
        if (s.house[k]!.floor === floor) frontier += openDoors(s, k).length;
      }
      expect(frontier, `floor ${floor} starts with open doors`).toBeGreaterThan(0);

      const doors = DRAWABLE_ROOMS
        .filter((r) => r.floors.includes(floor))
        .map((r) => r.doorways.length)
        .sort((a, b) => b - a);
      for (const d of doors) {
        expect(frontier, `floor ${floor} ran out of doorways`).toBeGreaterThan(0);
        frontier += d - 2; // -1 consumed to enter, +(d-1) new openings
      }
    }
  });
});
